import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { requireSourcesAuth } from '../lib/auth.ts';
import sources from '../functions/sources.ts';
import { BASE_ENV, INTERNAL_KEY, setEnv } from './helpers.ts';

let restoreEnv: () => void = () => {};

beforeEach(() => {
  restoreEnv = setEnv(BASE_ENV);
});

afterEach(() => {
  restoreEnv();
});

function createMockSupabaseJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const body = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const signature = 'mock_signature_test_hash';
  return `${header}.${body}.${signature}`;
}

describe('Authentication & JWT Session Verification', () => {
  it('rejects requests with missing or empty Authorization header', async () => {
    const req = new Request('https://x.test/api/sources', { method: 'GET' });
    await assert.rejects(
      async () => {
        await requireSourcesAuth(req);
      },
      (err: any) => {
        assert.equal(err.status, 401);
        assert.equal(err.code, 'UNAUTHORIZED');
        return true;
      }
    );
  });

  it('rejects malformed or incomplete bearer tokens', async () => {
    const req = new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: { authorization: 'Bearer invalid.token' },
    });
    await assert.rejects(
      async () => {
        await requireSourcesAuth(req);
      },
      (err: any) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  it('accepts valid Supabase JWT token and extracts organization_id tenancy', async () => {
    const jwt = createMockSupabaseJwt({
      sub: 'user_12345_uuid',
      email: 'engineer@corp.com',
      role: 'authenticated',
      organization_id: 'org_acme_corp',
    });

    const req = new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: { authorization: `Bearer ${jwt}` },
    });

    const identity = await requireSourcesAuth(req);
    assert.equal(identity.source, 'supabase_token');
    assert.equal(identity.orgId, 'org_acme_corp');
    assert.equal(identity.role, 'admin');
  });

  it('defaults to default orgId when Supabase JWT does not specify organization_id', async () => {
    const jwt = createMockSupabaseJwt({
      sub: 'user_99999_uuid',
      email: 'member@startup.io',
      role: 'authenticated',
    });

    const req = new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: { authorization: `Bearer ${jwt}` },
    });

    const identity = await requireSourcesAuth(req);
    assert.equal(identity.source, 'supabase_token');
    assert.equal(identity.orgId, 'default');
  });

  it('allows access to sources endpoint with real Supabase JWT format', async () => {
    const jwt = createMockSupabaseJwt({
      sub: 'test_user_789',
      email: 'admin@clarithmia.ai',
      role: 'authenticated',
      organization_id: 'tenant_primary',
    });

    const req = new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: { authorization: `Bearer ${jwt}` },
    });

    const res = await sources(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.sources));
  });

  it('maintains compatibility with internal API key for server jobs and schedulers', async () => {
    const req = new Request('https://x.test/api/sources', {
      method: 'GET',
      headers: { 'x-api-key': INTERNAL_KEY },
    });

    const identity = await requireSourcesAuth(req);
    assert.equal(identity.source, 'internal_key');
    assert.equal(identity.orgId, 'default');
  });
});
