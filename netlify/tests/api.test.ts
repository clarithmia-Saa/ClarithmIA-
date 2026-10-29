import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import zendesk from '../functions/connectors-zendesk.ts';
import twitter from '../functions/connectors-twitter.ts';
import webhook from '../functions/webhooks-incoming.ts';
import { hmacSha256Hex } from '../lib/auth.ts';
import { BASE_ENV, INTERNAL_KEY, WEBHOOK_SECRET, captureLogs, jsonResponse, mockFetch, setEnv } from './helpers.ts';

let restoreEnv: () => void = () => {};
let restoreFetch: () => void = () => {};

beforeEach(() => { restoreEnv = setEnv(BASE_ENV); });
afterEach(() => { restoreEnv(); restoreFetch(); restoreFetch = () => {}; });

const internal = { 'x-api-key': INTERNAL_KEY };
const hook = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.test/api/webhooks/incoming', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': WEBHOOK_SECRET, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function body(res: Response): Promise<any> { return res.json(); }

describe('POST /api/webhooks/incoming', () => {
  it('rejects a missing or wrong token with 401 and never reveals which part failed', async () => {
    const missing = await webhook(new Request('https://x.test/api/webhooks/incoming', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    const wrong = await webhook(hook({ text: 'hi' }, { 'x-webhook-token': 'nope' }));
    for (const res of [missing, wrong]) {
      assert.equal(res.status, 401);
      const json = await body(res);
      assert.equal(json.ok, false);
      assert.equal(json.error.code, 'UNAUTHORIZED');
      assert.ok(res.headers.get('x-request-id'));
    }
  });

  it('accepts the token via Authorization: Bearer too', async () => {
    const res = await webhook(hook({ text: 'Love it, great product' }, { 'x-webhook-token': '', authorization: `Bearer ${WEBHOOK_SECRET}` }));
    assert.equal(res.status, 200);
  });

  it('fails closed (500) when the secret is not configured', async () => {
    const restore = setEnv({ WEBHOOK_SECRET: undefined, WEBHOOK_SECRETS: undefined });
    try {
      const res = await webhook(hook({ text: 'x y' }));
      assert.equal(res.status, 500);
      assert.equal((await body(res)).error.code, 'CONFIG_MISSING');
    } finally { restore(); }
  });

  it('only allows POST, JSON content-type, valid JSON and bounded size', async () => {
    const get = await webhook(new Request('https://x.test/api/webhooks/incoming', { method: 'GET', headers: { 'x-webhook-token': WEBHOOK_SECRET } }));
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');

    const text = await webhook(hook('hello', { 'content-type': 'text/plain' }));
    assert.equal(text.status, 415);

    const bad = await webhook(hook('{not json'));
    assert.equal(bad.status, 400);
    assert.equal((await body(bad)).error.code, 'INVALID_JSON');

    const restore = setEnv({ WEBHOOK_MAX_BODY_BYTES: '1024' });
    try {
      const big = await webhook(hook({ text: 'a'.repeat(2000) }));
      assert.equal(big.status, 413);
    } finally { restore(); }
  });

  it('normalizes + analyzes a single feedback object', async () => {
    const res = await webhook(hook({ id: 'r-1', source: 'Trustpilot', message: 'Charged twice and nobody answers. URGENT refund please!', rating: 1, user: { name: 'Bob' }, created_at: '2026-10-20T10:00:00Z' }));
    assert.equal(res.status, 200);
    const json = await body(res);
    assert.equal(json.accepted, 1);
    assert.equal(json.results[0].id, 'trustpilot:r-1');
    assert.equal(json.results[0].analysis.sentiment.label, 'negative');
    assert.equal(json.results[0].analysis.category, 'Billing');
    assert.ok(['high', 'critical'].includes(json.results[0].analysis.urgency.level));
    assert.equal(json.sync.status, 'success');
    assert.equal(json.sync.counts.analyzed, 1);
  });

  it('handles batches: partial rejects, duplicates and wrapped arrays', async () => {
    const res = await webhook(hook({ items: [
      { id: 'a', text: 'Great app, love it' },
      { id: 'a', text: 'Great app, love it' },
      { id: 'b', text: '' },
      'garbage',
      { id: 'c', body: 'The app is slow and crashes sometimes' },
    ] }, { 'x-webhook-source': 'Intercom' }));
    assert.equal(res.status, 200);
    const json = await body(res);
    assert.equal(json.accepted, 2);
    assert.equal(json.rejected, 2);
    assert.deepEqual(json.rejects.map((r: any) => r.reason).sort(), ['item_must_be_object', 'missing_text']);
    assert.equal(json.sync.skipped.duplicate_in_batch, 1);
    assert.equal(json.sync.status, 'success');
    assert.equal(json.results[0].source, 'intercom');
  });

  it('returns 422 when nothing is valid and when the batch is too large', async () => {
    const none = await webhook(hook([{ foo: 1 }, { bar: 2 }]));
    assert.equal(none.status, 422);
    assert.equal((await body(none)).error.code, 'NO_VALID_ITEMS');
    const restore = setEnv({ WEBHOOK_MAX_ITEMS: '2' });
    try {
      const many = await webhook(hook([{ text: 'one one' }, { text: 'two two' }, { text: 'three three' }]));
      assert.equal(many.status, 422);
      assert.equal((await body(many)).error.code, 'TOO_MANY_ITEMS');
    } finally { restore(); }
  });

  it('enforces the optional HMAC signature', async () => {
    const restore = setEnv({ WEBHOOK_SIGNING_SECRET: 'sign-secret' });
    try {
      const payload = JSON.stringify({ text: 'Nice product overall' });
      const unsigned = await webhook(hook(payload));
      assert.equal(unsigned.status, 401);
      assert.equal((await body(unsigned)).error.code, 'INVALID_SIGNATURE');
      const sig = await hmacSha256Hex('sign-secret', payload);
      const ok = await webhook(hook(payload, { 'x-signature': `sha256=${sig}` }));
      assert.equal(ok.status, 200);
    } finally { restore(); }
  });

  it('persists to Supabase with an idempotent upsert and surfaces failures as retryable 502', async () => {
    const restore = setEnv({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'sb-service-SECRET' });
    try {
      const ok = mockFetch(() => new Response(null, { status: 201 }));
      restoreFetch = ok.restore;
      const res = await webhook(hook({ id: '1', text: 'Works great, thanks' }));
      assert.equal(res.status, 200);
      const json = await body(res);
      assert.equal(json.persistedTo, 'supabase');
      assert.equal(ok.calls.length, 1);
      assert.ok(ok.calls[0]!.url.includes('/rest/v1/feedback?on_conflict=organization_id,dedupe_key'));
      assert.equal(ok.calls[0]!.headers.prefer, 'resolution=merge-duplicates,return=minimal');
      const persistedRow = JSON.parse(ok.calls[0]!.body ?? '[]')[0];
      assert.equal(persistedRow.sentiment_label, 'positive');
      assert.equal(persistedRow.organization_id, 'org_test_default');
      ok.restore();

      const failing = mockFetch(() => jsonResponse({ message: 'down' }, 400));
      restoreFetch = failing.restore;
      const bad = await webhook(hook({ id: '2', text: 'Works great, thanks' }));
      assert.equal(bad.status, 502);
      const badJson = await body(bad);
      assert.equal(badJson.error.code, 'PERSISTENCE_FAILED');
      assert.equal(badJson.error.retryable, true);
    } finally { restore(); }
  });

  it('writes structured sync logs without leaking secrets or feedback text', async () => {
    const { result, logs, raw } = await captureLogs(() => webhook(hook({ id: 'x', text: 'My very private complaint about the product', password: 'p@ss' })));
    assert.equal(result.status, 200);
    const events = logs.map((l) => l.event);
    assert.ok(events.includes('sync.started'));
    assert.ok(events.includes('sync.completed'));
    assert.ok(events.includes('http.request'));
    const completed = logs.find((l) => l.event === 'sync.completed') as Record<string, any>;
    assert.equal(completed.connector, 'webhook');
    assert.equal(completed.counts.analyzed, 1);
    assert.ok(completed.runId && completed.requestId);
    const joined = raw.join('\n');
    assert.ok(!joined.includes(WEBHOOK_SECRET));
    assert.ok(!joined.includes('private complaint'));
  });

  it('handles CORS preflight OPTIONS requests for browser integration modals', async () => {
    const restore = setEnv({ CORS_ALLOWED_ORIGINS: '*' });
    try {
      const res = await webhook(new Request('https://x.test/api/webhooks/incoming', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      }));
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
      assert.ok(res.headers.get('access-control-allow-headers')?.includes('x-webhook-token'));
    } finally {
      restore();
    }
  });

  it('accepts real verification ping payload sent by ConnectSourceModal', async () => {
    const res = await webhook(hook({
      text: 'Verificação de conexão ClarithmIA',
      author: { name: 'Sistema de Verificação', handle: 'clarithmia_system' },
      metadata: { test: true, initiatedAt: '2026-10-26T12:00:00Z' },
    }));
    assert.equal(res.status, 200);
    const json = await body(res);
    assert.equal(json.ok, true);
    assert.equal(json.accepted, 1);
    assert.equal(json.connector, 'webhook');
    assert.ok(json.requestId);
  });
});

const zdTicket = (id: number, extra: Record<string, unknown> = {}) => ({
  id, subject: `Ticket ${id}`, description: `Cannot log in, error on the page. This is urgent! (${id})`,
  status: 'open', priority: 'high', requester_id: 7, created_at: '2026-10-24T10:00:00Z', updated_at: '2026-10-24T11:00:00Z', tags: ['login'], via: { channel: 'email' }, ...extra,
});

describe('GET /api/connectors/zendesk', () => {
  it('requires the internal API key', async () => {
    const res = await zendesk(new Request('https://x.test/api/connectors/zendesk'));
    assert.equal(res.status, 401);
    assert.equal((await body(res)).error.code, 'UNAUTHORIZED');
  });

  it('authenticates with Bearer, syncs tickets incrementally and resolves requesters', async () => {
    const m = mockFetch((url) => {
      if (url.pathname === '/api/v2/incremental/tickets/cursor.json') {
        return jsonResponse({ tickets: [zdTicket(1), zdTicket(2, { status: 'deleted' }), zdTicket(3, { description: null, subject: null })], after_cursor: 'CUR_2', end_of_stream: false },
          200, { 'x-rate-limit': '10', 'x-rate-limit-remaining': '9' });
      }
      if (url.pathname === '/api/v2/users/show_many.json') return jsonResponse({ users: [{ id: 7, name: 'Dana Support', email: 'Dana@Corp.com' }] });
      return new Response('unexpected', { status: 500 });
    });
    restoreFetch = m.restore;
    const { result: res, logs, raw } = await captureLogs(() => zendesk(new Request('https://x.test/api/connectors/zendesk?limit=50&since=2026-10-23T00:00:00Z', { headers: internal })));
    assert.equal(res.status, 200);
    const json = await body(res);

    assert.equal(m.calls[0]!.headers.authorization, 'Bearer zd-oauth-token-SECRET');
    assert.ok(m.calls[0]!.url.startsWith('https://acme.zendesk.com/api/v2/incremental/tickets/cursor.json?start_time='));
    assert.ok(m.calls[0]!.url.includes('per_page=50'));
    assert.ok(m.calls[1]!.url.includes('ids=7'));

    assert.equal(json.connector, 'zendesk');
    assert.equal(json.nextCursor, 'CUR_2');
    assert.equal(json.hasMore, true);
    assert.equal(json.items.length, 1);
    assert.equal(json.items[0].author.name, 'Dana Support');
    assert.equal(json.items[0].author.email, 'dana@corp.com');
    assert.equal(json.items[0].metadata.priority, 'high');
    assert.ok(['high', 'critical'].includes(json.items[0].analysis.urgency.level));
    assert.equal(json.sync.counts.fetched, 3);
    assert.equal(json.sync.counts.normalized, 1);
    assert.equal(json.sync.skipped.deleted, 1);
    assert.equal(json.sync.skipped.empty_text, 1);
    assert.equal(json.sync.rateLimit.remaining, 9);

    assert.ok(logs.some((l) => l.event === 'sync.completed' && l.connector === 'zendesk'));
    assert.ok(!raw.join('\n').includes('zd-oauth-token-SECRET'));
  });

  it('continues from a cursor and falls back to the API-token Basic auth', async () => {
    const restore = setEnv({ ZENDESK_ACCESS_TOKEN: undefined, ZENDESK_EMAIL: 'admin@acme.com', ZENDESK_API_TOKEN: 'tok123' });
    try {
      const m = mockFetch((url) => url.pathname.includes('incremental') ? jsonResponse({ tickets: [], after_cursor: 'CUR_9', end_of_stream: true }) : jsonResponse({ users: [] }));
      restoreFetch = m.restore;
      const res = await zendesk(new Request('https://x.test/api/connectors/zendesk?cursor=CUR_2', { headers: internal }));
      assert.equal(res.status, 200);
      assert.ok(m.calls[0]!.url.includes('cursor=CUR_2'));
      assert.equal(m.calls[0]!.headers.authorization, `Basic ${btoa('admin@acme.com/token:tok123')}`);
      const json = await body(res);
      assert.equal(json.hasMore, false);
      assert.equal(json.sync.status, 'success');
    } finally { restore(); }
  });

  it('validates parameters', async () => {
    const both = await zendesk(new Request('https://x.test/api/connectors/zendesk?cursor=abc&since=2026-10-01', { headers: internal }));
    assert.equal(both.status, 400);
    const limit = await zendesk(new Request('https://x.test/api/connectors/zendesk?limit=9999', { headers: internal }));
    assert.equal(limit.status, 400);
    assert.equal((await body(limit)).error.code, 'INVALID_PARAMETER');
    const since = await zendesk(new Request('https://x.test/api/connectors/zendesk?since=banana', { headers: internal }));
    assert.equal(since.status, 400);
  });

  it('retries transient 503s and then succeeds', async () => {
    let hits = 0;
    const m = mockFetch((url) => {
      if (url.pathname.includes('incremental')) {
        hits += 1;
        return hits === 1 ? new Response('busy', { status: 503 }) : jsonResponse({ tickets: [zdTicket(5)], after_cursor: 'C', end_of_stream: true });
      }
      return jsonResponse({ users: [] });
    });
    restoreFetch = m.restore;
    const res = await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal }));
    assert.equal(res.status, 200);
    assert.equal(hits, 2);
    assert.equal((await body(res)).items.length, 1);
  });

  it('honours Retry-After on 429 and surfaces RATE_LIMITED when it cannot wait', async () => {
    let hits = 0;
    const ok = mockFetch((url) => {
      if (url.pathname.includes('incremental')) {
        hits += 1;
        return hits === 1 ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }) : jsonResponse({ tickets: [], after_cursor: null, end_of_stream: true });
      }
      return jsonResponse({ users: [] });
    });
    restoreFetch = ok.restore;
    assert.equal((await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal }))).status, 200);
    ok.restore();

    const limited = mockFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }));
    restoreFetch = limited.restore;
    const res = await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal }));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('retry-after'), '120');
    const json = await body(res);
    assert.equal(json.error.code, 'RATE_LIMITED');
    assert.equal(json.error.retryable, true);
  });

  it('maps upstream auth failures to a safe 502 and logs sync.failed', async () => {
    const m = mockFetch(() => jsonResponse({ error: 'Couldn\'t authenticate you' }, 401));
    restoreFetch = m.restore;
    const { result: res, logs, raw } = await captureLogs(() => zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal })));
    assert.equal(res.status, 502);
    const json = await body(res);
    assert.equal(json.error.code, 'UPSTREAM_AUTH_FAILED');
    assert.ok(json.error.details.hint);
    assert.ok(logs.some((l) => l.event === 'sync.failed' && l.connector === 'zendesk'));
    assert.ok(!JSON.stringify(json).includes('zd-oauth-token-SECRET'));
    assert.ok(!raw.join('\n').includes('zd-oauth-token-SECRET'));
  });

  it('reports a bad upstream payload and missing configuration', async () => {
    const m = mockFetch(() => new Response('<html>oops</html>', { status: 200 }));
    restoreFetch = m.restore;
    const bad = await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal }));
    assert.equal(bad.status, 502);
    assert.equal((await body(bad)).error.code, 'UPSTREAM_BAD_RESPONSE');
    const restore = setEnv({ ZENDESK_SUBDOMAIN: undefined });
    try {
      const res = await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal }));
      assert.equal(res.status, 500);
      assert.equal((await body(res)).error.details.variable, 'ZENDESK_SUBDOMAIN');
    } finally { restore(); }
  });

  it('supports dryRun (no persistence) and CORS for allowed origins', async () => {
    const restore = setEnv({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k', CORS_ALLOWED_ORIGINS: 'https://app.test' });
    try {
      const m = mockFetch((url) => url.pathname.includes('incremental') ? jsonResponse({ tickets: [zdTicket(1)], after_cursor: 'C', end_of_stream: true }) : jsonResponse({ users: [] }));
      restoreFetch = m.restore;
      const res = await zendesk(new Request('https://x.test/api/connectors/zendesk?dryRun=true', { headers: { ...internal, origin: 'https://app.test' } }));
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.test');
      assert.ok(!m.calls.some((c) => c.url.includes('db.test')));
      const pre = await zendesk(new Request('https://x.test/api/connectors/zendesk', { method: 'OPTIONS', headers: { origin: 'https://app.test' } }));
      assert.equal(pre.status, 204);
      const other = await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: { ...internal, origin: 'https://evil.test' } }));
      assert.equal(other.headers.get('access-control-allow-origin'), null);
    } finally { restore(); }
  });
});

const tweet = (id: string, extra: Record<string, unknown> = {}) => ({
  id, text: `@brand the app keeps crashing, please fix this asap (${id})`, author_id: '42', created_at: '2026-10-24T09:00:00.000Z', lang: 'en',
  conversation_id: id, public_metrics: { like_count: 3 }, ...extra,
});

describe('GET /api/connectors/twitter', () => {
  it('fetches mentions with the Bearer token, expansions and pagination metadata', async () => {
    const m = mockFetch((url) => {
      assert.equal(url.pathname, '/2/users/999/mentions');
      return jsonResponse({
        data: [tweet('100'), tweet('101', { author_id: '999', text: 'our own reply to someone' }), tweet('102', { text: '   ' })],
        includes: { users: [{ id: '42', username: 'angry_dev', name: 'Angry Dev', verified: true, public_metrics: { followers_count: 1200 } }] },
        meta: { result_count: 3, newest_id: '102', oldest_id: '100', next_token: 'NEXT_PAGE' },
      }, 200, { 'x-rate-limit-limit': '180', 'x-rate-limit-remaining': '179', 'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 900) });
    });
    restoreFetch = m.restore;
    const res = await twitter(new Request('https://x.test/api/connectors/twitter?limit=25&sinceId=90', { headers: internal }));
    assert.equal(res.status, 200);
    const json = await body(res);

    const called = new URL(m.calls[0]!.url);
    assert.equal(m.calls[0]!.headers.authorization, 'Bearer tw-bearer-token-SECRET');
    assert.equal(called.hostname, 'api.x.com');
    assert.equal(called.searchParams.get('max_results'), '25');
    assert.equal(called.searchParams.get('since_id'), '90');
    assert.equal(called.searchParams.get('expansions'), 'author_id');

    assert.equal(json.items.length, 1);
    assert.equal(json.items[0].author.handle, '@angry_dev');
    assert.equal(json.items[0].url, 'https://x.com/angry_dev/status/100');
    assert.equal(json.items[0].analysis.sentiment.label, 'negative');
    assert.equal(json.items[0].analysis.category, 'Stability');
    assert.equal(json.cursor.sinceId, '102');
    assert.equal(json.cursor.paginationToken, 'NEXT_PAGE');
    assert.equal(json.hasMore, true);
    assert.equal(json.sync.skipped.own_tweet, 1);
    assert.equal(json.sync.skipped.empty_text, 1);
    assert.equal(json.sync.rateLimit.remaining, 179);
  });

  it('resolves a username to a user id once and caches it', async () => {
    const restore = setEnv({ TWITTER_USER_ID: undefined, TWITTER_USERNAME: 'MyBrand' });
    try {
      const m = mockFetch((url) => url.pathname.startsWith('/2/users/by/username/')
        ? jsonResponse({ data: { id: '555', username: 'MyBrand' } })
        : jsonResponse({ meta: { result_count: 0 } }));
      restoreFetch = m.restore;
      const first = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
      assert.equal(first.status, 200);
      assert.ok(m.calls[1]!.url.includes('/users/555/mentions'));
      const second = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
      assert.equal(second.status, 200);
      assert.equal(m.calls.filter((c) => c.url.includes('/by/username/')).length, 1);
      assert.equal((await body(second)).items.length, 0);
    } finally { restore(); }
  });

  it('validates input and configuration', async () => {
    const both = await twitter(new Request('https://x.test/api/connectors/twitter?sinceId=1&startTime=2026-10-01', { headers: internal }));
    assert.equal(both.status, 400);
    const small = await twitter(new Request('https://x.test/api/connectors/twitter?limit=2', { headers: internal }));
    assert.equal(small.status, 400);
    const badId = await twitter(new Request('https://x.test/api/connectors/twitter?sinceId=abc', { headers: internal }));
    assert.equal(badId.status, 400);
    const restore = setEnv({ TWITTER_BEARER_TOKEN: undefined });
    try {
      const noToken = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
      assert.equal(noToken.status, 500);
    } finally { restore(); }
    const restore2 = setEnv({ TWITTER_USER_ID: undefined, TWITTER_USERNAME: undefined });
    try {
      const noAccount = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
      assert.equal(noAccount.status, 400);
      assert.equal((await body(noAccount)).error.code, 'MISSING_ACCOUNT');
    } finally { restore2(); }
  });

  it('turns upstream 401/403 into actionable, non-leaky errors', async () => {
    const unauthorized = mockFetch(() => jsonResponse({ title: 'Unauthorized', status: 401 }, 401));
    restoreFetch = unauthorized.restore;
    const a = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
    assert.equal(a.status, 502);
    assert.equal((await body(a)).error.code, 'UPSTREAM_AUTH_FAILED');
    unauthorized.restore();

    const forbidden = mockFetch(() => jsonResponse({ title: 'Forbidden', status: 403 }, 403));
    restoreFetch = forbidden.restore;
    const b = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
    assert.equal(b.status, 502);
    const json = await body(b);
    assert.equal(json.error.code, 'UPSTREAM_FORBIDDEN');
    assert.ok(/plan|permission/i.test(json.error.details.hint));
  });

  it('respects x-rate-limit-reset: waits when short, returns 429 + Retry-After when long', async () => {
    let hits = 0;
    const shortWait = mockFetch(() => {
      hits += 1;
      return hits === 1
        ? new Response('limit', { status: 429, headers: { 'x-rate-limit-reset': String(Math.floor(Date.now() / 1000)) } })
        : jsonResponse({ data: [], meta: { result_count: 0 } });
    });
    restoreFetch = shortWait.restore;
    assert.equal((await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }))).status, 200);
    shortWait.restore();

    const longWait = mockFetch(() => new Response('limit', { status: 429, headers: { 'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 600) } }));
    restoreFetch = longWait.restore;
    const res = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) >= 590);
  });

  it('keeps going when X returns partial errors and reports them as warnings', async () => {
    const m = mockFetch(() => jsonResponse({ data: [tweet('1')], errors: [{ title: 'Not Found Error', detail: 'Could not find user with ids: [42].' }], meta: { result_count: 1, newest_id: '1' } }));
    restoreFetch = m.restore;
    const res = await twitter(new Request('https://x.test/api/connectors/twitter', { headers: internal }));
    const json = await body(res);
    assert.equal(res.status, 200);
    assert.equal(json.sync.status, 'partial');
    assert.equal(json.items[0].author.name, 'User 42');
    assert.ok(json.sync.warnings[0].includes('Not Found Error'));
  });
});

describe('platform behaviour', () => {
  it('echoes a safe x-request-id and generates one otherwise', async () => {
    const res = await webhook(hook({ text: 'hello there friend' }, { 'x-request-id': 'req-abcdef123456' }));
    assert.equal(res.headers.get('x-request-id'), 'req-abcdef123456');
    const res2 = await webhook(hook({ text: 'hello there friend' }, { 'x-request-id': 'bad id with spaces' }));
    assert.match(res2.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  });

  it('never leaks internals on unexpected failures', async () => {
    const m = mockFetch(() => { throw new TypeError('socket hang up: secret-host.internal'); });
    restoreFetch = m.restore;
    const restore = setEnv({ UPSTREAM_MAX_RETRIES: '0' });
    try {
      const res = await zendesk(new Request('https://x.test/api/connectors/zendesk', { headers: internal }));
      assert.equal(res.status, 502);
      const text = JSON.stringify(await body(res));
      assert.ok(text.includes('UPSTREAM_UNREACHABLE'));
      assert.ok(!text.includes('secret-host.internal'));
    } finally { restore(); }
  });
});
