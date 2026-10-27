import { optionalEnv, requireEnv, intEnv } from '../lib/env.ts';
import { AppError, badRequest, configError, toAppError, upstreamBadResponse } from '../lib/errors.ts';
import { createHandler } from '../lib/http.ts';
import { fetchJson, type UpstreamResult } from '../lib/http-client.ts';
import { analyzeBatch } from '../lib/ai.ts';
import { normalizeZendeskTicket, toIso, type ZendeskTicket, type ZendeskUser } from '../lib/normalize.ts';
import { boolParam, intParam, readParams, strParam } from '../lib/params.ts';
import { persistFeedback } from '../lib/sink.ts';
import { startSync } from '../lib/sync.ts';
import type { NormalizedFeedback, SyncReport } from '../lib/types.ts';

export const config = { path: '/api/connectors/zendesk' };

const SUBDOMAIN = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
const CURSOR = /^[A-Za-z0-9+/=_.-]+$/;

interface IncrementalTicketsResponse {
  tickets?: ZendeskTicket[];
  after_cursor?: string | null;
  end_of_stream?: boolean;
}

function zendeskTarget(): { subdomain: string; baseUrl: string } {
  const subdomain = requireEnv('ZENDESK_SUBDOMAIN').toLowerCase();
  if (!SUBDOMAIN.test(subdomain)) throw configError('ZENDESK_SUBDOMAIN (invalid format)');
  const override = optionalEnv('ZENDESK_BASE_URL');
  return { subdomain, baseUrl: (override ?? `https://${subdomain}.zendesk.com`).replace(/\/+$/, '') };
}

/**
 * Preferred: OAuth access token sent as `Authorization: Bearer`.
 * Fallback: Zendesk API token (`email/token:token`) which Zendesk expects as Basic auth.
 */
function zendeskAuthHeader(): string {
  const bearer = optionalEnv('ZENDESK_ACCESS_TOKEN');
  if (bearer) return `Bearer ${bearer}`;
  const email = optionalEnv('ZENDESK_EMAIL');
  const apiToken = optionalEnv('ZENDESK_API_TOKEN');
  if (email && apiToken) return `Basic ${btoa(`${email}/token:${apiToken}`)}`;
  throw configError('ZENDESK_ACCESS_TOKEN');
}

function readRateLimit(headers: Headers): SyncReport['rateLimit'] | undefined {
  const limit = Number(headers.get('x-rate-limit'));
  const remaining = Number(headers.get('x-rate-limit-remaining'));
  const reset = Number(headers.get('ratelimit-reset'));
  const out: NonNullable<SyncReport['rateLimit']> = {};
  if (Number.isFinite(limit) && headers.get('x-rate-limit')) out.limit = limit;
  if (Number.isFinite(remaining) && headers.get('x-rate-limit-remaining')) out.remaining = remaining;
  if (Number.isFinite(reset) && headers.get('ratelimit-reset')) out.resetAt = new Date(Date.now() + reset * 1000).toISOString();
  return Object.keys(out).length > 0 ? out : undefined;
}

export default createHandler({
  name: 'connector.zendesk',
  methods: ['GET', 'POST'],
  auth: 'internal',
  cors: true,
  async handle({ req, url, log, deadlineAt }) {
    const params = await readParams(req, url);
    const cursor = strParam(params, 'cursor', CURSOR, 500);
    const limit = intParam(params, 'limit', 100, 1, 200);
    const dryRun = boolParam(params, 'dryRun');
    const sinceParam = params.since;
    if (cursor && sinceParam) throw badRequest('CONFLICTING_PARAMETERS', 'Use either "cursor" or "since", not both.');

    const { subdomain, baseUrl } = zendeskTarget();
    const authorization = zendeskAuthHeader();

    // Zendesk requires start_time to be at least one minute in the past.
    const now = Date.now();
    const maxLookbackMs = intEnv('ZENDESK_MAX_LOOKBACK_DAYS', 30, 1, 365) * 86_400_000;
    let startMs = now - 24 * 3_600_000;
    if (sinceParam !== undefined && sinceParam !== '') {
      const iso = toIso(sinceParam);
      if (!iso) throw badRequest('INVALID_PARAMETER', 'Parameter "since" must be an ISO date or epoch timestamp.', { parameter: 'since' });
      startMs = Date.parse(iso);
    }

    const tracker = startSync('zendesk', log, { subdomain, mode: cursor ? 'cursor' : 'since', limit, dryRun });
    try {
      if (!cursor) {
        if (startMs < now - maxLookbackMs) {
          startMs = now - maxLookbackMs;
          tracker.warn(`since clamped to the ${Math.round(maxLookbackMs / 86_400_000)} day lookback limit`);
        }
        if (startMs > now - 65_000) {
          startMs = now - 65_000;
          tracker.warn('since adjusted: Zendesk requires start_time to be at least one minute old');
        }
      }

      const query = cursor ? `cursor=${encodeURIComponent(cursor)}` : `start_time=${Math.floor(startMs / 1000)}`;
      const ticketsRes: UpstreamResult<IncrementalTicketsResponse> = await fetchJson<IncrementalTicketsResponse>({
        upstream: 'Zendesk',
        url: `${baseUrl}/api/v2/incremental/tickets/cursor.json?${query}&per_page=${limit}`,
        headers: { authorization },
        deadlineAt,
        log,
        hints: {
          unauthorized: 'Check ZENDESK_ACCESS_TOKEN (Bearer) or the ZENDESK_EMAIL / ZENDESK_API_TOKEN pair.',
          forbidden: 'The token needs the "read" scope and an admin/agent with export permission.',
        },
      });
      if (!ticketsRes.data || !Array.isArray(ticketsRes.data.tickets)) throw upstreamBadResponse('Zendesk');

      const tickets = ticketsRes.data.tickets;
      tracker.counts.fetched = tickets.length;
      const rateLimit = readRateLimit(ticketsRes.headers);

      // Resolve requester names (best effort: a failure here must not fail the sync).
      const requesterIds = [...new Set(tickets.map((t) => t.requester_id).filter((id): id is number | string => id !== undefined && id !== null).map(String))];
      const requesters = new Map<string, ZendeskUser>();
      for (let i = 0; i < requesterIds.length; i += 100) {
        const batch = requesterIds.slice(i, i + 100);
        try {
          const usersRes = await fetchJson<{ users?: ZendeskUser[] }>({
            upstream: 'Zendesk',
            url: `${baseUrl}/api/v2/users/show_many.json?ids=${batch.join(',')}`,
            headers: { authorization },
            deadlineAt,
            log,
            retries: 1,
          });
          for (const user of usersRes.data?.users ?? []) {
            if (user.id !== undefined) requesters.set(String(user.id), user);
          }
        } catch (err) {
          const appError = toAppError(err);
          tracker.warn(`requester lookup failed (${appError.code}); falling back to requester ids`);
          break;
        }
      }

      const receivedAt = new Date().toISOString();
      const normalized: NormalizedFeedback[] = [];
      for (const ticket of tickets) {
        const result = await normalizeZendeskTicket(ticket, requesters, { subdomain, baseUrl, receivedAt });
        if ('skip' in result) tracker.skip(result.skip);
        else normalized.push(result);
      }
      tracker.counts.normalized = normalized.length;

      const processed = await analyzeBatch(normalized);
      tracker.counts.analyzed = processed.length;

      let persistTarget: 'supabase' | 'none' = 'none';
      if (!dryRun) {
        try {
          const persisted = await persistFeedback(processed, { log, deadlineAt });
          tracker.counts.persisted = persisted.persisted;
          persistTarget = persisted.target;
        } catch (err) {
          const appError = toAppError(err);
          throw new AppError(502, 'PERSISTENCE_FAILED', 'Feedback was fetched but could not be stored. The cursor was not advanced; retry the same request.', {
            retryable: true,
            details: { cause: appError.code },
          });
        }
      }

      const nextCursor = ticketsRes.data.after_cursor ?? null;
      const hasMore = ticketsRes.data.end_of_stream === false;
      const report = tracker.finish({
        hasMore,
        cursor: { after: nextCursor },
        ...(rateLimit ? { rateLimit } : {}),
      });

      return {
        body: {
          connector: 'zendesk',
          sync: report,
          nextCursor,
          hasMore,
          persistedTo: persistTarget,
          items: processed,
        },
      };
    } catch (err) {
      const appError = toAppError(err);
      tracker.error(appError.code, appError.expose ? appError.message : 'internal error');
      tracker.finish();
      throw err;
    }
  },
});
