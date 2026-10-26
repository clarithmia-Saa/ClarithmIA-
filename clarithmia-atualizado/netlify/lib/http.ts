import { requireInternalAuth, requireWebhookToken } from './auth.ts';
import { intEnv, listEnv } from './env.ts';
import { methodNotAllowed, toAppError } from './errors.ts';
import { createLogger, serializeError, type Logger } from './logger.ts';

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

/** Accepts an upstream correlation id only when it is short and harmless. */
export function sanitizeRequestId(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : null;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowed = listEnv('CORS_ALLOWED_ORIGINS');
  if (!origin || allowed.length === 0) return {};
  if (!allowed.includes('*') && !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': allowed.includes('*') ? '*' : origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-api-key, x-request-id',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

export interface HandlerContext {
  req: Request;
  url: URL;
  requestId: string;
  log: Logger;
  startedAt: number;
  /** Absolute epoch (ms) after which upstream calls must stop. */
  deadlineAt: number;
}

export type HandlerResult = Response | { status?: number; body: Record<string, unknown>; headers?: Record<string, string> };

export interface HandlerOptions {
  /** Used in logs, e.g. `connector.zendesk`. */
  name: string;
  methods: readonly string[];
  auth: 'internal' | 'webhook';
  /** Enables CORS headers for browser callers (connector endpoints only). */
  cors?: boolean;
  handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}

/**
 * Wraps a route handler with: request ids, method guard, authentication, CORS,
 * uniform JSON envelopes, error mapping and structured request logs.
 */
export function createHandler(options: HandlerOptions): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startedAt = Date.now();
    const requestId = sanitizeRequestId(req.headers.get('x-request-id')) ?? sanitizeRequestId(req.headers.get('x-nf-request-id')) ?? crypto.randomUUID();
    const log = createLogger({ fn: options.name, requestId });
    const url = new URL(req.url);
    const cors = options.cors ? corsHeaders(req) : {};
    let response: Response;

    try {
      if (req.method === 'OPTIONS' && options.cors) {
        response = new Response(null, { status: 204, headers: { ...cors, 'cache-control': 'no-store' } });
      } else {
        if (!options.methods.includes(req.method)) throw methodNotAllowed(options.methods);
        if (options.auth === 'internal') await requireInternalAuth(req);
        else await requireWebhookToken(req);

        const deadlineAt = startedAt + intEnv('REQUEST_DEADLINE_MS', 8000, 1000, 25000);
        const result = await options.handle({ req, url, requestId, log, startedAt, deadlineAt });
        response =
          result instanceof Response
            ? result
            : json({ ok: true, requestId, ...result.body }, result.status ?? 200, result.headers ?? {});
      }
    } catch (err) {
      const appError = toAppError(err);
      const event = appError.status >= 500 ? 'request.failed' : 'request.rejected';
      log[appError.status >= 500 ? 'error' : 'warn'](event, { status: appError.status, error: serializeError(err) });
      response = json(
        {
          ok: false,
          error: {
            code: appError.code,
            message: appError.expose ? appError.message : 'Unexpected server error.',
            requestId,
            retryable: appError.retryable,
            ...(appError.expose && appError.details ? { details: appError.details } : {}),
          },
        },
        appError.status,
        appError.headers,
      );
    }

    const headers = new Headers(response.headers);
    headers.set('x-request-id', requestId);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    const finalResponse = new Response(response.body, { status: response.status, headers });

    log.info('http.request', {
      method: req.method,
      path: url.pathname,
      status: finalResponse.status,
      durationMs: Date.now() - startedAt,
    });
    return finalResponse;
  };
}
