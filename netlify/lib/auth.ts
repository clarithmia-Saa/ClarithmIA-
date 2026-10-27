import { listEnv } from './env.ts';
import { configError, unauthorized } from './errors.ts';

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
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqual(provided, expected);
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await sha256Bytes(value));
}
