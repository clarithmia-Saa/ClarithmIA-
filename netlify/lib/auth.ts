import { listEnv, optionalEnv } from './env.ts';
import { AppError, configError, unauthorized } from './errors.ts';

const encoder = new TextEncoder();

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Compares two strings in constant time (hashing first equalizes the lengths). */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) diff |= (ha[i] ?? 0) ^ (hb[i] ?? 0);
  return diff === 0;
}

/** Checks every configured secret (no early exit) so timing does not reveal which one matched. */
export async function matchesAnySecret(candidate: string, secrets: readonly string[]): Promise<boolean> {
  let matched = false;
  for (const secret of secrets) {
    if (await constantTimeEqual(candidate, secret)) matched = true;
  }
  return matched;
}

export function readBearerOrHeader(req: Request, headerName: string): string | null {
  const direct = req.headers.get(headerName)?.trim();
  if (direct) return direct;
  const authorization = req.headers.get('authorization')?.trim();
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/** Protects the connector endpoints (called by the ClarithmIA app / schedulers). */
export async function requireInternalAuth(req: Request): Promise<void> {
  const secrets = listEnv('INTERNAL_API_KEYS', 'INTERNAL_API_KEY');
  if (secrets.length === 0) throw configError('INTERNAL_API_KEY');
  const candidate = readBearerOrHeader(req, 'x-api-key');
  if (!candidate || !(await matchesAnySecret(candidate, secrets))) throw unauthorized();
}

/** Protects the universal webhook: header `x-webhook-token` (or `Authorization: Bearer`). */
export async function requireWebhookToken(req: Request): Promise<void> {
  const secrets = listEnv('WEBHOOK_SECRETS', 'WEBHOOK_SECRET');
  if (secrets.length === 0) throw configError('WEBHOOK_SECRET');
  const candidate = readBearerOrHeader(req, 'x-webhook-token');
  if (!candidate || !(await matchesAnySecret(candidate, secrets))) throw unauthorized('Invalid webhook token.');
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

/** Verifies `x-signature: sha256=<hex>` computed over the raw request body. */
export async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const provided = header.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqual(provided, expected);
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await sha256Bytes(value));
}

export interface SourcesAuthIdentity {
  orgId: string;
  role: 'admin' | 'editor' | 'viewer';
  source: 'internal_key' | 'supabase_token';
}

function supabaseConfiguration() {
  const url = optionalEnv('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = optionalEnv('SUPABASE_ANON_KEY') ?? optionalEnv('VITE_SUPABASE_ANON_KEY');
  if (!url) throw configError('SUPABASE_URL');
  if (!serviceKey) throw configError('SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey) throw configError('SUPABASE_ANON_KEY');
  return { url, serviceKey, anonKey };
}

async function supabaseRequest(url: string, key: string, token?: string): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    headers: {
      apikey: key,
      authorization: `Bearer ${token ?? key}`,
      accept: 'application/json',
    },
  });
}

/**
 * Authenticates the bearer token against Supabase Auth, then resolves tenancy
 * from organization_members. JWT claims supplied by the browser are never
 * used as an organization or role source.
 */
async function authenticateSupabaseUser(token: string, requestedOrgId: string | null): Promise<SourcesAuthIdentity> {
  const { url, serviceKey, anonKey } = supabaseConfiguration();

  let authResponse: Response;
  try {
    authResponse = await supabaseRequest(`${url}/auth/v1/user`, anonKey, token);
  } catch {
    throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'Authentication provider is unavailable.', { retryable: true });
  }
  if (!authResponse.ok) throw unauthorized('Invalid or expired Supabase access token.');

  let user: { id?: unknown; app_metadata?: unknown };
  try {
    user = await authResponse.json() as { id?: unknown; app_metadata?: unknown };
  } catch {
    throw unauthorized('Invalid Supabase user response.');
  }
  if (typeof user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)) {
    throw unauthorized('Supabase did not return a valid user identity.');
  }

  const membersUrl = new URL(`${url}/rest/v1/organization_members`);
  membersUrl.searchParams.set('user_id', `eq.${user.id}`);
  membersUrl.searchParams.set('select', 'organization_id,role');
  if (requestedOrgId) membersUrl.searchParams.set('organization_id', `eq.${requestedOrgId}`);

  let membersResponse: Response;
  try {
    membersResponse = await fetch(membersUrl, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        accept: 'application/json',
      },
    });
  } catch {
    throw new AppError(503, 'TENANCY_PROVIDER_UNAVAILABLE', 'Organization membership could not be verified.', { retryable: true });
  }
  if (!membersResponse.ok) {
    throw new AppError(503, 'TENANCY_LOOKUP_FAILED', 'Organization membership could not be verified.', { retryable: true });
  }

  let memberships: Array<{ organization_id?: unknown; role?: unknown }>;
  try {
    memberships = await membersResponse.json() as Array<{ organization_id?: unknown; role?: unknown }>;
  } catch {
    throw new AppError(503, 'TENANCY_LOOKUP_FAILED', 'Organization membership response was invalid.', { retryable: true });
  }

  const valid = memberships.filter((item) =>
    typeof item.organization_id === 'string' &&
    ['admin', 'editor', 'viewer'].includes(String(item.role))
  );
  if (valid.length === 0) throw new AppError(403, 'ORGANIZATION_ACCESS_DENIED', 'You are not a member of this organization.', { retryable: false });
  if (!requestedOrgId && valid.length !== 1) {
    throw new AppError(400, 'ORGANIZATION_REQUIRED', 'Select an organization using the x-organization-id header.', { retryable: false });
  }
  if (valid.length !== 1) throw new AppError(403, 'ORGANIZATION_ACCESS_DENIED', 'You do not have access to the requested organization.', { retryable: false });

  const membership = valid[0]!;
  return {
    orgId: membership.organization_id as string,
    role: membership.role as SourcesAuthIdentity['role'],
    source: 'supabase_token',
  };
}

/** Authenticates source requests and resolves the organization from trusted membership data. */
export async function requireSourcesAuth(req: Request): Promise<SourcesAuthIdentity> {
  const internalSecrets = listEnv('INTERNAL_API_KEYS', 'INTERNAL_API_KEY');
  const candidate = readBearerOrHeader(req, 'x-api-key');
  const authorization = req.headers.get('authorization')?.trim();
  const bearerMatch = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
  const token = bearerMatch?.[1]?.trim();

  if (candidate && internalSecrets.length > 0 && (await matchesAnySecret(candidate, internalSecrets))) {
    const orgId = req.headers.get('x-organization-id')?.trim() || optionalEnv('DEFAULT_ORGANIZATION_ID');
    if (!orgId || orgId === 'default') throw configError('DEFAULT_ORGANIZATION_ID (must be a real organization ID)');
    return { orgId, role: 'admin', source: 'internal_key' };
  }
  if (token && internalSecrets.length > 0 && (await matchesAnySecret(token, internalSecrets))) {
    const orgId = req.headers.get('x-organization-id')?.trim() || optionalEnv('DEFAULT_ORGANIZATION_ID');
    if (!orgId || orgId === 'default') throw configError('DEFAULT_ORGANIZATION_ID (must be a real organization ID)');
    return { orgId, role: 'admin', source: 'internal_key' };
  }

  if (!token || /^session_/i.test(token) || token.split('.').length !== 3) {
    throw unauthorized('A valid Supabase access token is required.');
  }

  const identity = await authenticateSupabaseUser(token, req.headers.get('x-organization-id')?.trim() || null);
  if (req.method !== 'GET' && identity.role === 'viewer') {
    throw new AppError(403, 'INSUFFICIENT_ROLE', 'Viewer role cannot modify integration sources.', { retryable: false });
  }
  return identity;
}
