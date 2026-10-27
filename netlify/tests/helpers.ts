export const INTERNAL_KEY = 'internal-test-key-123456';
export const WEBHOOK_SECRET = 'webhook-test-secret-123456';

export function setEnv(values: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

export const BASE_ENV: Record<string, string | undefined> = {
  INTERNAL_API_KEY: INTERNAL_KEY,
  WEBHOOK_SECRET: WEBHOOK_SECRET,
  WEBHOOK_SIGNING_SECRET: undefined,
  ZENDESK_SUBDOMAIN: 'acme',
  ZENDESK_ACCESS_TOKEN: 'zd-oauth-token-SECRET',
  ZENDESK_EMAIL: undefined,
  ZENDESK_API_TOKEN: undefined,
  ZENDESK_BASE_URL: undefined,
  TWITTER_BEARER_TOKEN: 'tw-bearer-token-SECRET',
  TWITTER_USER_ID: '999',
  TWITTER_USERNAME: undefined,
  TWITTER_API_BASE: undefined,
  SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  LOG_LEVEL: 'error',
  UPSTREAM_RETRY_BASE_MS: '1',
  UPSTREAM_MAX_RETRIES: '2',
  REQUEST_DEADLINE_MS: '8000',
  CORS_ALLOWED_ORIGINS: undefined,
};

export type MockRoute = (url: URL, init: RequestInit) => Response | Promise<Response>;

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** Replaces global fetch with a router. Returns the recorded calls and a restore function. */
export function mockFetch(route: MockRoute): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push({
      url: url.href,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(typeof init.body === 'string' ? { body: init.body } : {}),
    });
    return route(url, init);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Captures structured logs written through console.* while `fn` runs. */
export async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: Record<string, unknown>[]; raw: string[] }> {
  const raw: string[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const previousLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  console.log = (line: unknown) => { raw.push(String(line)); };
  console.warn = (line: unknown) => { raw.push(String(line)); };
  console.error = (line: unknown) => { raw.push(String(line)); };
  try {
    const result = await fn();
    return { result, logs: raw.map((line) => JSON.parse(line) as Record<string, unknown>), raw };
  } finally {
    if (previousLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLevel;
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
  }
}
