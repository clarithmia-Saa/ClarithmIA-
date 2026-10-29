import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { requireSourcesAuth } from '../lib/auth.ts';
import { BASE_ENV, INTERNAL_KEY, jsonResponse, mockFetch, setEnv } from './helpers.ts';

let restoreEnv: () => void = () => {};
let restoreFetch: () => void = () => {};

beforeEach(() => {
  restoreEnv = setEnv({
    ...BASE_ENV,
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    SUPABASE_ANON_KEY: 'mock-anon-key',
  });
});

afterEach(() => {
  restoreEnv();
  restoreFetch();
  restoreFetch = () => {};
});

const userId = '11111111-1111-4111-8111-111111111111';
const validLookingJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJl';

describe('Authentication & tenant membership verification', () => {
  it('rejects requests with missing Authorization header', async () => {
    await assert.rejects(
      () => requireSourcesAuth(new Request('https://x.test/api/sources')),
      (err: any) => err.status === 401 && err.code === 'UNAUTHORIZED',
    );
  });

  it('rejects malformed bearer tokens and fake session tokens', async () => {
    for (const token of ['invalid.token', 'session_default_clarithmia']) {
      await assert.rejects(
        () => requireSourcesAuth(new Request('https://x.test/api/sources', {
          headers: { authorization: `Bearer ${token}` },
        })),
        (err: any) => err.status === 401,
      );
    }
  });

  it('resolves organization and role from verified membership, not JWT claims', async () => {
    const m = mockFetch((url) => {
      if (url.pathname === '/auth/v1/user') {
        return jsonResponse({ id: userId, app_metadata: { organization_id: 'attacker_org', role: 'admin' } });
      }
      if (url.pathname === '/rest/v1/organization_members') {
        assert.match(url.search, /user_id=eq\./);
        assert.match(url.search, /organization_id=eq\.org_acme/);
        return jsonResponse([{ organization_id: 'org_acme', role: 'editor' }]);
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    restoreFetch = m.restore;

    const identity = await requireSourcesAuth(new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${validLookingJwt}`,
        'x-organization-id': 'org_acme',
      },
    }));

    assert.equal(identity.source, 'supabase_token');
    assert.equal(identity.orgId, 'org_acme');
    assert.equal(identity.role, 'editor');
    assert.equal(m.calls.length, 2);
  });

  it('rejects an access token that Supabase Auth does not validate', async () => {
    const m = mockFetch((url) => url.pathname === '/auth/v1/user'
      ? jsonResponse({ message: 'invalid token' }, 401)
      : jsonResponse([], 200));
    restoreFetch = m.restore;

    await assert.rejects(
      () => requireSourcesAuth(new Request('https://x.test/api/sources', {
        headers: { authorization: `Bearer ${validLookingJwt}`, 'x-organization-id': 'org_acme' },
      })),
      (err: any) => err.status === 401 && err.code === 'UNAUTHORIZED',
    );
  });

  it('rejects users who do not belong to the requested organization', async () => {
    const m = mockFetch((url) => url.pathname === '/auth/v1/user'
      ? jsonResponse({ id: userId })
      : jsonResponse([], 200));
    restoreFetch = m.restore;

    await assert.rejects(
      () => requireSourcesAuth(new Request('https://x.test/api/sources', {
        headers: { authorization: `Bearer ${validLookingJwt}`, 'x-organization-id': 'org_other' },
      })),
      (err: any) => err.status === 403 && err.code === 'ORGANIZATION_ACCESS_DENIED',
    );
  });

  it('requires an organization selection when the user belongs to multiple organizations', async () => {
    const m = mockFetch((url) => url.pathname === '/auth/v1/user'
      ? jsonResponse({ id: userId })
      : jsonResponse([
          { organization_id: 'org_a', role: 'viewer' },
          { organization_id: 'org_b', role: 'admin' },
        ], 200));
    restoreFetch = m.restore;

    await assert.rejects(
      () => requireSourcesAuth(new Request('https://x.test/api/sources', {
        headers: { authorization: `Bearer ${validLookingJwt}` },
      })),
      (err: any) => err.status === 400 && err.code === 'ORGANIZATION_REQUIRED',
    );
  });

  it('does not allow viewer role to modify sources', async () => {
    const m = mockFetch((url) => url.pathname === '/auth/v1/user'
      ? jsonResponse({ id: userId })
      : jsonResponse([{ organization_id: 'org_acme', role: 'viewer' }], 200));
    restoreFetch = m.restore;

    await assert.rejects(
      () => requireSourcesAuth(new Request('https://x.test/api/sources', {
        method: 'POST',
        headers: { authorization: `Bearer ${validLookingJwt}`, 'x-organization-id': 'org_acme' },
      })),
      (err: any) => err.status === 403 && err.code === 'INSUFFICIENT_ROLE',
    );
  });

  it('supports trusted server-to-server calls using the internal API key', async () => {
    const identity = await requireSourcesAuth(new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: { 'x-api-key': INTERNAL_KEY },
    }));
    assert.equal(identity.source, 'internal_key');
    assert.equal(identity.orgId, 'org_test_default');
    assert.equal(identity.role, 'admin');
  });
});
