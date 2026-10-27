import { verifySignature } from '../lib/auth.ts';
import { intEnv, optionalEnv } from '../lib/env.ts';
import { AppError, badRequest, payloadTooLarge, toAppError, unprocessable, unsupportedMediaType } from '../lib/errors.ts';
import { createHandler } from '../lib/http.ts';
import { analyzeBatch } from '../lib/ai.ts';
import { normalizeWebhookItem } from '../lib/normalize.ts';
import { persistFeedback } from '../lib/sink.ts';
import { startSync } from '../lib/sync.ts';
import type { NormalizedFeedback } from '../lib/types.ts';

export const config = { path: '/api/webhooks/incoming' };

const MAX_REPORTED_REJECTS = 20;

function extractItems(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['items', 'data', 'feedback', 'events', 'records']) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) return candidate;
    }
    return [payload];
  }
  return null;
}

function sanitizeSource(raw: string | null): string {
  const slug = (raw ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug.length > 0 ? slug : 'webhook';
}

export default createHandler({
  name: 'webhook.incoming',
  methods: ['POST'],
  auth: 'webhook',
  cors: true,
  async handle({ req, log, deadlineAt }) {
    const contentType = req.headers.get('content-type') ?? '';
    if (!/^application\/(.+\+)?json\b/i.test(contentType)) throw unsupportedMediaType('application/json');

    const maxBytes = intEnv('WEBHOOK_MAX_BODY_BYTES', 262_144, 1024, 5_000_000);
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge(maxBytes);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > maxBytes) throw payloadTooLarge(maxBytes);

    const signingSecret = optionalEnv('WEBHOOK_SIGNING_SECRET');
    if (signingSecret && !(await verifySignature(rawBody, req.headers.get('x-signature'), signingSecret))) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'The request signature does not match the payload.', { retryable: false });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw badRequest('INVALID_JSON', 'The request body is not valid JSON.');
    }

    const items = extractItems(payload);
    if (!items || items.length === 0) throw badRequest('EMPTY_PAYLOAD', 'The payload must be a feedback object or a non-empty list of them.');
    const maxItems = intEnv('WEBHOOK_MAX_ITEMS', 100, 1, 500);
    if (items.length > maxItems) throw unprocessable('TOO_MANY_ITEMS', `A single request accepts at most ${maxItems} items.`, { max: maxItems, received: items.length });

    const defaultSource = sanitizeSource(req.headers.get('x-webhook-source'));
    const tracker = startSync('webhook', log, { defaultSource, received: items.length, bytes: rawBody.length });

    try {
      tracker.counts.fetched = items.length;
      const receivedAt = new Date().toISOString();
      const unique = new Map<string, NormalizedFeedback>();
      const rejects: { index: number; reason: string }[] = [];

      for (const [index, raw] of items.entries()) {
        const result = await normalizeWebhookItem(raw, { defaultSource, receivedAt });
        if (!result.ok) {
          tracker.skip(result.reason);
          rejects.push({ index, reason: result.reason });
          continue;
        }
        if (unique.has(result.feedback.dedupeKey)) tracker.skip('duplicate_in_batch');
        unique.set(result.feedback.dedupeKey, result.feedback);
      }

      const normalized = [...unique.values()];
      tracker.counts.normalized = normalized.length;
      if (normalized.length === 0) {
        throw unprocessable('NO_VALID_ITEMS', 'None of the submitted items could be normalized.', { rejects: rejects.slice(0, MAX_REPORTED_REJECTS) });
      }

      const processed = await analyzeBatch(normalized);
      tracker.counts.analyzed = processed.length;

      let persistTarget: 'supabase' | 'none' = 'none';
      try {
        const persisted = await persistFeedback(processed, { log, deadlineAt });
        tracker.counts.persisted = persisted.persisted;
        persistTarget = persisted.target;
      } catch (err) {
        const appError = toAppError(err);
        throw new AppError(502, 'PERSISTENCE_FAILED', 'Feedback was received but could not be stored. Please retry the delivery.', {
          retryable: true,
          details: { cause: appError.code },
        });
      }

      const report = tracker.finish();
      return {
        body: {
          connector: 'webhook',
          accepted: processed.length,
          rejected: rejects.length,
          persistedTo: persistTarget,
          sync: report,
          results: processed.map((item) => ({
            id: item.id,
            dedupeKey: item.dedupeKey,
            source: item.source,
            createdAt: item.createdAt,
            analysis: {
              sentiment: item.analysis.sentiment,
              category: item.analysis.category,
              topics: item.analysis.topics,
              urgency: item.analysis.urgency,
              confidence: item.analysis.confidence,
              summary: item.analysis.summary,
              model: item.analysis.model,
            },
          })),
          rejects: rejects.slice(0, MAX_REPORTED_REJECTS),
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
