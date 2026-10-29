import { optionalEnv, requireEnv } from '../lib/env.ts';
import { AppError, badRequest, toAppError, upstreamBadResponse } from '../lib/errors.ts';
import { createHandler } from '../lib/http.ts';
import { fetchJson } from '../lib/http-client.ts';
import { analyzeBatch } from '../lib/ai.ts';
import { normalizeTweet, toIso, type TweetV2, type TwitterUserV2 } from '../lib/normalize.ts';
import { boolParam, intParam, readParams, strParam } from '../lib/params.ts';
import { persistFeedback } from '../lib/sink.ts';
import { startSync } from '../lib/sync.ts';
import type { NormalizedFeedback, SyncReport } from '../lib/types.ts';

export const config = { path: '/api/connectors/twitter' };

interface MentionsResponse {
  data?: TweetV2[];
  includes?: { users?: TwitterUserV2[] };
  meta?: { newest_id?: string; oldest_id?: string; result_count?: number; next_token?: string };
  errors?: { title?: string; detail?: string; type?: string }[];
}

const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const NUMERIC_ID = /^\d{1,25}$/;
const PAGINATION_TOKEN = /^[A-Za-z0-9_-]{1,200}$/;

// Username -> id lookups are stable, so warm function instances can cache them.
const userIdCache = new Map<string, string>();

function apiBase(): string {
  return (optionalEnv('TWITTER_API_BASE') ?? 'https://api.x.com/2').replace(/\/+$/, '');
}

function readRateLimit(headers: Headers): SyncReport['rateLimit'] | undefined {
  const out: NonNullable<SyncReport['rateLimit']> = {};
  const limit = Number(headers.get('x-rate-limit-limit'));
  const remaining = Number(headers.get('x-rate-limit-remaining'));
  const reset = Number(headers.get('x-rate-limit-reset'));
  if (headers.get('x-rate-limit-limit') && Number.isFinite(limit)) out.limit = limit;
  if (headers.get('x-rate-limit-remaining') && Number.isFinite(remaining)) out.remaining = remaining;
  if (headers.get('x-rate-limit-reset') && Number.isFinite(reset)) out.resetAt = new Date(reset * 1000).toISOString();
  return Object.keys(out).length > 0 ? out : undefined;
}

const HINTS = {
  unauthorized: 'Check TWITTER_BEARER_TOKEN (an app-only Bearer token from the X Developer Portal).',
  forbidden: 'Your X API plan or app permissions may not include reading mentions.',
} as const;

export default createHandler({
  name: 'connector.twitter',
  methods: ['GET', 'POST'],
  auth: 'internal',
  cors: true,
  async handle({ req, url, log, deadlineAt }) {
    const params = await readParams(req, url);
    const limit = intParam(params, 'limit', 50, 5, 100);
    const sinceId = strParam(params, 'sinceId', NUMERIC_ID);
    const paginationToken = strParam(params, 'paginationToken', PAGINATION_TOKEN);
    const startTimeRaw = params.startTime;
    const dryRun = boolParam(params, 'dryRun');
    const usernameParam = strParam(params, 'username', USERNAME);
    const userIdParam = strParam(params, 'userId', NUMERIC_ID);

    let startTime: string | undefined;
    if (startTimeRaw !== undefined && startTimeRaw !== '') {
      const iso = toIso(startTimeRaw);
      if (!iso) throw badRequest('INVALID_PARAMETER', 'Parameter "startTime" must be an ISO date or epoch timestamp.', { parameter: 'startTime' });
      startTime = iso.replace(/\.\d{3}Z$/, 'Z');
    }
    if (sinceId && startTime) throw badRequest('CONFLICTING_PARAMETERS', 'Use either "sinceId" or "startTime", not both.');

    const bearer = requireEnv('TWITTER_BEARER_TOKEN');
    const headers = { authorization: `Bearer ${bearer}` };
    const base = apiBase();
    const tracker = startSync('twitter', log, { limit, dryRun, mode: sinceId ? 'since_id' : startTime ? 'start_time' : 'latest' });

    try {
      let userId = userIdParam ?? optionalEnv('TWITTER_USER_ID');
      if (!userId) {
        const username = (usernameParam ?? optionalEnv('TWITTER_USERNAME'))?.replace(/^@/, '');
        if (!username) {
          throw badRequest('MISSING_ACCOUNT', 'Provide "userId" / "username" or configure TWITTER_USER_ID / TWITTER_USERNAME.');
        }
        if (!USERNAME.test(username)) throw badRequest('INVALID_PARAMETER', 'Invalid X username.', { parameter: 'username' });
        const cached = userIdCache.get(username.toLowerCase());
        if (cached) userId = cached;
        else {
          const lookup = await fetchJson<{ data?: { id?: string } }>({
            upstream: 'X API',
            url: `${base}/users/by/username/${encodeURIComponent(username)}`,
            headers,
            deadlineAt,
            log,
            hints: HINTS,
          });
          const resolved = lookup.data?.data?.id;
          if (!resolved) throw new AppError(404, 'ACCOUNT_NOT_FOUND', `No X account found for @${username}.`, { retryable: false });
          userIdCache.set(username.toLowerCase(), resolved);
          userId = resolved;
        }
      }

      const query = new URLSearchParams({
        max_results: String(limit),
        'tweet.fields': 'created_at,public_metrics,lang,conversation_id,author_id,referenced_tweets,in_reply_to_user_id',
        expansions: 'author_id',
        'user.fields': 'username,name,verified,public_metrics',
      });
      if (sinceId) query.set('since_id', sinceId);
      if (startTime) query.set('start_time', startTime);
      if (paginationToken) query.set('pagination_token', paginationToken);

      const res = await fetchJson<MentionsResponse>({
        upstream: 'X API',
        url: `${base}/users/${encodeURIComponent(userId)}/mentions?${query.toString()}`,
        headers,
        deadlineAt,
        log,
        hints: HINTS,
      });
      const body = res.data;
      if (!body || typeof body !== 'object') throw upstreamBadResponse('X API');
      if (body.data !== undefined && !Array.isArray(body.data)) throw upstreamBadResponse('X API');
      for (const issue of body.errors ?? []) {
        tracker.warn(`X API: ${issue.title ?? issue.type ?? 'partial error'}${issue.detail ? ` - ${issue.detail.slice(0, 120)}` : ''}`);
      }

      const tweets = body.data ?? [];
      tracker.counts.fetched = tweets.length;
      const users = new Map<string, TwitterUserV2>();
      for (const user of body.includes?.users ?? []) {
        if (user.id) users.set(user.id, user);
      }

      const receivedAt = new Date().toISOString();
      const normalized: NormalizedFeedback[] = [];
      for (const tweet of tweets) {
        const result = await normalizeTweet(tweet, users, { ownUserId: userId, receivedAt });
        if ('skip' in result) tracker.skip(result.skip);
        else normalized.push(result);
      }
      tracker.counts.normalized = normalized.length;

      const processed = await analyzeBatch(normalized);
      tracker.counts.analyzed = processed.length;

      let persistTarget: 'supabase' | 'none' = 'none';
      if (!dryRun) {
        try {
          const persisted = await persistFeedback(processed, { log, deadlineAt, organizationId: optionalEnv('DEFAULT_ORGANIZATION_ID') });
          tracker.counts.persisted = persisted.persisted;
          persistTarget = persisted.target;
        } catch (err) {
          const appError = toAppError(err);
          throw new AppError(502, 'PERSISTENCE_FAILED', 'Mentions were fetched but could not be stored. Retry the same request.', {
            retryable: true,
            details: { cause: appError.code },
          });
        }
      }

      const nextToken = body.meta?.next_token ?? null;
      const newestId = body.meta?.newest_id ?? null;
      const rateLimit = readRateLimit(res.headers);
      const report = tracker.finish({
        hasMore: Boolean(nextToken),
        cursor: { sinceId: newestId, paginationToken: nextToken },
        ...(rateLimit ? { rateLimit } : {}),
      });

      return {
        body: {
          connector: 'twitter',
          sync: report,
          cursor: { sinceId: newestId, paginationToken: nextToken },
          hasMore: Boolean(nextToken),
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
