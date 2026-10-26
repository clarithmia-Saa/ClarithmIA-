import { AppError, deadlineExceeded, tooManyRequests, upstreamBadResponse, upstreamError } from './errors.ts';
import { intEnv } from './env.ts';
import type { Logger } from './logger.ts';

export interface UpstreamRequest {
  /** Human-readable upstream name used in errors and logs, e.g. `Zendesk`. */
  upstream: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  /** Absolute epoch (ms). The client never sleeps or waits past it. */
  deadlineAt: number;
  log: Logger;
  /** Injection points for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Optional hint added to 401/403 errors. */
  hints?: { forbidden?: string; unauthorized?: string };
}

export interface UpstreamResult<T> {
  data: T;
  status: number;
  headers: Headers;
  attempts: number;
}

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number, baseMs: number): number {
  const exp = Math.min(baseMs * 2 ** attempt, 4000);
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

/** Reads `Retry-After` (seconds or HTTP date) or X's `x-rate-limit-reset` (epoch seconds). */
export function retryAfterMs(headers: Headers, now = Date.now()): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  const reset = headers.get('x-rate-limit-reset');
  if (reset) {
    const epoch = Number(reset);
    if (Number.isFinite(epoch)) return Math.max(0, epoch * 1000 - now);
  }
  return null;
}

/**
 * JSON-over-HTTP client with per-attempt timeouts, bounded retries with
 * exponential backoff + jitter, `Retry-After` support and error mapping.
 */
export async function fetchJson<T = unknown>(req: UpstreamRequest): Promise<UpstreamResult<T>> {
  const doFetch = req.fetchImpl ?? fetch;
  const sleep = req.sleep ?? defaultSleep;
  const maxRetries = req.retries ?? intEnv('UPSTREAM_MAX_RETRIES', 2, 0, 5);
  const baseMs = intEnv('UPSTREAM_RETRY_BASE_MS', 300, 1, 5000);
  const perAttemptTimeout = req.timeoutMs ?? intEnv('UPSTREAM_TIMEOUT_MS', 6000, 500, 25000);
  let lastError: AppError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const remaining = req.deadlineAt - Date.now();
    if (remaining <= 50) throw lastError ?? deadlineExceeded(req.upstream);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(perAttemptTimeout, remaining));
    const startedAt = Date.now();

    try {
      const response = await doFetch(req.url, {
        method: req.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...req.headers,
        },
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const status = response.status;
      const text = await response.text();

      if (status >= 200 && status < 300) {
        let data: unknown = null;
        if (text.trim().length > 0) {
          try {
            data = JSON.parse(text);
          } catch {
            throw upstreamBadResponse(req.upstream);
          }
        }
        return { data: data as T, status, headers: response.headers, attempts: attempt + 1 };
      }

      req.log.warn('upstream.error_response', {
        upstream: req.upstream,
        status,
        attempt: attempt + 1,
        latencyMs: Date.now() - startedAt,
        bodyPreview: text.slice(0, 300),
      });

      if (status === 429) {
        const waitMs = retryAfterMs(response.headers) ?? backoffMs(attempt, baseMs);
        const canWait = attempt < maxRetries && Date.now() + waitMs < req.deadlineAt - 500;
        if (!canWait) throw tooManyRequests(waitMs / 1000, `${req.upstream} rate limit reached.`);
        req.log.info('upstream.retry', { upstream: req.upstream, reason: 'rate_limited', waitMs, attempt: attempt + 1 });
        await sleep(waitMs);
        continue;
      }

      if (RETRYABLE_STATUS.has(status)) {
        lastError = upstreamError(req.upstream, 502, status);
        if (attempt < maxRetries) {
          const waitMs = backoffMs(attempt, baseMs);
          if (Date.now() + waitMs < req.deadlineAt - 200) {
            req.log.info('upstream.retry', { upstream: req.upstream, reason: `http_${status}`, waitMs, attempt: attempt + 1 });
            await sleep(waitMs);
            continue;
          }
        }
        throw lastError;
      }

      const hint = status === 401 ? req.hints?.unauthorized : status === 403 ? req.hints?.forbidden : undefined;
      throw upstreamError(req.upstream, 502, status, hint);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AppError) throw err;

      const aborted = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
      lastError = aborted ? deadlineExceeded(req.upstream) : new AppError(502, 'UPSTREAM_UNREACHABLE', `${req.upstream} could not be reached.`, { retryable: true, details: { upstream: req.upstream }, cause: err });

      if (attempt < maxRetries) {
        const waitMs = backoffMs(attempt, baseMs);
        if (Date.now() + waitMs < req.deadlineAt - 200) {
          req.log.info('upstream.retry', { upstream: req.upstream, reason: aborted ? 'timeout' : 'network', waitMs, attempt: attempt + 1 });
          await sleep(waitMs);
          continue;
        }
      }
      throw lastError;
    }
  }
  throw lastError ?? deadlineExceeded(req.upstream);
}
