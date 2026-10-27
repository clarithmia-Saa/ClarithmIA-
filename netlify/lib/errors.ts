export interface AppErrorOptions {
  retryable?: boolean;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** When false the message is replaced by a generic one in HTTP responses. */
  expose?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  readonly headers: Record<string, string>;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.retryable = options.retryable ?? status >= 500;
    this.details = options.details;
    this.headers = options.headers ?? {};
    this.expose = options.expose ?? true;
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, { retryable: false, ...(details ? { details } : {}) });

export const unauthorized = (message = 'Missing or invalid credentials.') =>
  new AppError(401, 'UNAUTHORIZED', message, {
    retryable: false,
    headers: { 'www-authenticate': 'Bearer realm="clarithmia"' },
  });

export const methodNotAllowed = (allowed: readonly string[]) =>
  new AppError(405, 'METHOD_NOT_ALLOWED', `Method not allowed. Use: ${allowed.join(', ')}.`, {
    retryable: false,
    headers: { allow: allowed.join(', ') },
  });

export const payloadTooLarge = (maxBytes: number) =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', `Payload exceeds the ${maxBytes} byte limit.`, { retryable: false });

export const unsupportedMediaType = (expected: string) =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `Content-Type must be ${expected}.`, { retryable: false });

export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(422, code, message, { retryable: false, ...(details ? { details } : {}) });

export const tooManyRequests = (retryAfterSeconds: number, message = 'Rate limit reached. Try again later.') =>
  new AppError(429, 'RATE_LIMITED', message, {
    retryable: true,
    headers: { 'retry-after': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    details: { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) },
  });

export const configError = (variable: string) =>
  new AppError(500, 'CONFIG_MISSING', `Server configuration is incomplete: ${variable}.`, {
    retryable: false,
    details: { variable },
  });

export const deadlineExceeded = (upstream: string) =>
  new AppError(504, 'DEADLINE_EXCEEDED', `The request to ${upstream} did not finish in time.`, { retryable: true });

export function upstreamError(upstream: string, status: number, upstreamStatus: number, hint?: string): AppError {
  const base = { upstream, upstreamStatus };
  if (upstreamStatus === 401) {
    return new AppError(status, 'UPSTREAM_AUTH_FAILED', `${upstream} rejected the configured credentials.`, {
      retryable: false,
      details: { ...base, hint: hint ?? 'Check the access token / API credentials and their scopes.' },
    });
  }
  if (upstreamStatus === 403) {
    return new AppError(status, 'UPSTREAM_FORBIDDEN', `${upstream} denied access to this resource.`, {
      retryable: false,
      details: { ...base, hint: hint ?? 'The credentials are valid but lack permission, or the plan does not allow it.' },
    });
  }
  if (upstreamStatus === 404) {
    return new AppError(status, 'UPSTREAM_NOT_FOUND', `${upstream} could not find the requested resource.`, {
      retryable: false,
      details: base,
    });
  }
  return new AppError(status, 'UPSTREAM_ERROR', `${upstream} returned an unexpected error (${upstreamStatus}).`, {
    retryable: upstreamStatus >= 500,
    details: base,
  });
}

export const upstreamBadResponse = (upstream: string) =>
  new AppError(502, 'UPSTREAM_BAD_RESPONSE', `${upstream} returned a response that could not be parsed.`, {
    retryable: true,
    details: { upstream },
  });

/** Wraps anything thrown into an AppError without leaking internals. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError(500, 'INTERNAL_ERROR', 'Unexpected server error.', {
    retryable: false,
    expose: false,
    cause: err,
  });
}
