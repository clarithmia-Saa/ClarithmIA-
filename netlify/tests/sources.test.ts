import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import sources from '../functions/sources.ts';
import webhookVerify from '../functions/webhooks-verify.ts';
import { BASE_ENV, INTERNAL_KEY, WEBHOOK_SECRET, jsonResponse, mockFetch, setEnv } from './helpers.ts';

let restoreEnv: () => void = () => {};
let restoreFetch: () => void = () => {};

beforeEach(() => {
  restoreEnv = setEnv(BASE_ENV);
});

afterEach(() => {
  restoreEnv();
  restoreFetch();
  restoreFetch = () => {};
});

const internalAuth = { 'x-api-key': INTERNAL_KEY };
const sessionAuth = internalAuth;

async function parseBody(res: Response): Promise<any> {
  return res.json();
}

describe('Sources API (/api/sources)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const unauth = await sources(new Request('https://x.test/api/sources', { method: 'GET' }));
    assert.equal(unauth.status, 401);
    const data = await parseBody(unauth);
    assert.equal(data.ok, false);
    assert.equal(data.error.code, 'UNAUTHORIZED');
  });

  it('lists sources with internal key or session auth when Supabase is unconfigured', async () => {
    const res = await sources(new Request('https://x.test/api/sources', { method: 'GET', headers: sessionAuth }));
    assert.equal(res.status, 200);
    const data = await parseBody(res);
    assert.equal(data.ok, true);
    assert.equal(data.persistedTo, 'none');
    assert.ok(Array.isArray(data.sources));
    assert.equal(data.sources.length, 10);
    assert.ok(data.sources.some((s: any) => s.platform === 'webhook'));
    assert.ok(data.sources.some((s: any) => s.platform === 'instagram'));
  });

  it('fetches sources from Supabase PostgREST when configured', async () => {
    const restore = setEnv({
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key-xyz',
    });
    try {
      const m = mockFetch((url) => {
        if (url.pathname.includes('/rest/v1/sources')) {
          return jsonResponse([
            {
              id: 'default-webhook',
              platform: 'webhook',
              status: 'operational',
              connected: true,
              display_name: 'Webhook de Entrada',
              feedbacks_count: 42,
              last_sync_at: '2026-10-27T10:00:00Z',
              config_metadata: { endpointUrl: '/api/webhooks/incoming' },
              organization_id: 'org_test_default',
            },
          ]);
        }
        return jsonResponse({}, 404);
      });
      restoreFetch = m.restore;

      const res = await sources(new Request('https://x.test/api/sources', { method: 'GET', headers: internalAuth }));
      assert.equal(res.status, 200);
      const data = await parseBody(res);
      assert.equal(data.ok, true);
      assert.equal(data.persistedTo, 'supabase');
      const webhookSource = data.sources.find((s: any) => s.platform === 'webhook');
      assert.ok(webhookSource);
      assert.equal(webhookSource.connected, true);
      assert.equal(webhookSource.feedbacksCount, 42);

      // Verify that call used service role key securely server-side
      assert.equal(m.calls[0]?.headers['apikey'], 'mock-service-key-xyz');
      assert.equal(m.calls[0]?.headers['authorization'], 'Bearer mock-service-key-xyz');
    } finally {
      restore();
    }
  });

  it('rejects POST with invalid platform', async () => {
    const res = await sources(
      new Request('https://x.test/api/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...internalAuth },
        body: JSON.stringify({ platform: 'myspace', connected: true }),
      }),
    );
    assert.equal(res.status, 400);
    const data = await parseBody(res);
    assert.equal(data.error.code, 'INVALID_PLATFORM');
  });

  it('sanitizes sensitive fields from configMetadata upon upsert', async () => {
    const restore = setEnv({
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key-xyz',
    });
    try {
      let savedRow: any = null;
      const m = mockFetch((_url, init) => {
        if (typeof init.body === 'string') {
          savedRow = JSON.parse(init.body)[0];
        }
        return jsonResponse([savedRow]);
      });
      restoreFetch = m.restore;

      const res = await sources(
        new Request('https://x.test/api/sources', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...sessionAuth },
          body: JSON.stringify({
            platform: 'webhook',
            status: 'operational',
            connected: true,
            displayName: 'Universal Webhook',
            configMetadata: {
              endpointUrl: 'https://app.clarithmia.com/api/webhooks/incoming',
              // Sensitive fields that MUST be filtered out
              secretKey: 'super-secret-token',
              apiToken: 'jwt-12345',
              privateKey: '-----BEGIN RSA PRIVATE KEY-----',
            },
          }),
        }),
      );

      assert.equal(res.status, 200);
      assert.ok(savedRow);
      assert.equal(savedRow.config_metadata.endpointUrl, 'https://app.clarithmia.com/api/webhooks/incoming');
      // Sensitive fields MUST NOT be present
      assert.equal(savedRow.config_metadata.secretKey, undefined);
      assert.equal(savedRow.config_metadata.apiToken, undefined);
      assert.equal(savedRow.config_metadata.privateKey, undefined);
    } finally {
      restore();
    }
  });

  it('disconnects source without deleting or modifying feedback history', async () => {
    const restore = setEnv({
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key-xyz',
    });
    try {
      let patchCalled = false;
      let feedbackTouched = false;

      const m = mockFetch((url, init) => {
        if (url.pathname.includes('/rest/v1/sources') && init.method === 'PATCH') {
          patchCalled = true;
          return jsonResponse([{ platform: 'x', connected: false, status: 'disconnected' }]);
        }
        if (url.pathname.includes('/rest/v1/feedback')) {
          feedbackTouched = true;
        }
        return jsonResponse([]);
      });
      restoreFetch = m.restore;

      const res = await sources(
        new Request('https://x.test/api/sources', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', ...sessionAuth },
          body: JSON.stringify({
            platform: 'x',
            action: 'disconnect',
          }),
        }),
      );

      assert.equal(res.status, 200);
      const data = await parseBody(res);
      assert.equal(data.ok, true);
      assert.equal(data.disconnected, true);
      assert.equal(data.source.connected, false);
      assert.equal(data.source.status, 'disconnected');

      assert.equal(patchCalled, true);
      // STRICT INVARIANT: feedback table must NEVER be touched when disconnecting a source
      assert.equal(feedbackTouched, false);
    } finally {
      restore();
    }
  });
});

describe('Webhook Verification Endpoint (/api/webhooks/verify)', () => {
  it('rejects verification if token is missing or incorrect with 401', async () => {
    const missing = await webhookVerify(
      new Request('https://x.test/api/webhooks/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    );
    assert.equal(missing.status, 401);

    const wrong = await webhookVerify(
      new Request('https://x.test/api/webhooks/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-token': 'wrong-token' },
        body: '{}',
      }),
    );
    assert.equal(wrong.status, 401);
  });

  it('verifies valid token and returns verification response without persisting feedback', async () => {
    const restore = setEnv({
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key-xyz',
    });
    try {
      let feedbackTouched = false;
      const m = mockFetch((url) => {
        if (url.pathname.includes('/rest/v1/feedback')) {
          feedbackTouched = true;
        }
        return jsonResponse([]);
      });
      restoreFetch = m.restore;

      const res = await webhookVerify(
        new Request('https://x.test/api/webhooks/verify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-webhook-token': WEBHOOK_SECRET,
          },
          body: JSON.stringify({ test: true }),
        }),
      );

      assert.equal(res.status, 200);
      const data = await parseBody(res);
      assert.equal(data.ok, true);
      assert.equal(data.verified, true);
      assert.equal(data.connector, 'webhook');
      assert.equal(data.persistedTo, 'none');

      // STRICT INVARIANT: no feedback row created during connectivity test
      assert.equal(feedbackTouched, false);
    } finally {
      restore();
    }
  });
});
