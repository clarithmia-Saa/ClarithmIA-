export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSink = (level: LogLevel, line: string) => void;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /(token|secret|password|authorization|api[-_]?key|signature|cookie|credential)/i;
const SAFE_KEYS = new Set(['paginationToken', 'nextToken', 'cursor', 'afterCursor', 'tokenType']);
const MAX_STRING = 500;
const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ARRAY = 20;

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const withMeta = err as Error & { code?: unknown; status?: unknown; retryable?: unknown; details?: unknown };
    const out: Record<string, unknown> = { name: err.name, message: err.message };
    if (withMeta.code !== undefined) out.code = withMeta.code;
    if (withMeta.status !== undefined) out.status = withMeta.status;
    if (withMeta.retryable !== undefined) out.retryable = withMeta.retryable;
    if (withMeta.details !== undefined) out.details = redact(withMeta.details, 3);
    if (err.stack) out.stack = err.stack.split('\n').slice(0, 8).join('\n');
    if (err.cause !== undefined) {
      out.cause = err.cause instanceof Error ? { name: err.cause.name, message: err.cause.message } : String(err.cause);
    }
    return out;
  }
  return { message: String(err) };
}

/** Recursively redacts secrets and bounds the size of anything that gets logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING} chars]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return serializeError(value);
  if (depth >= MAX_DEPTH) return '[max depth]';
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY) out.push(`[+${value.length - MAX_ARRAY} more]`);
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_KEYS) {
        out['…'] = 'truncated';
        break;
      }
      count += 1;
      out[key] = !SAFE_KEYS.has(key) && SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const defaultSink: LogSink = (level, line) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export interface LoggerOptions {
  sink?: LogSink;
  level?: LogLevel;
}

function resolveLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

export function createLogger(bindings: Record<string, unknown> = {}, options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? defaultSink;
  const threshold = ORDER[options.level ?? resolveLevel()];

  const write = (level: LogLevel, event: string, data?: Record<string, unknown>) => {
    if (ORDER[level] < threshold) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      service: 'clarithmia-api',
      ...(redact(bindings) as Record<string, unknown>),
      ...(data ? (redact(data) as Record<string, unknown>) : {}),
    });
    sink(level, line);
  };

  return {
    debug: (event, data) => write('debug', event, data),
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
    child: (extra) => createLogger({ ...bindings, ...extra }, options),
  };
}
