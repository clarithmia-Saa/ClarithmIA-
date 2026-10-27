import { badRequest, payloadTooLarge } from './errors.ts';

const MAX_PARAM_BODY_BYTES = 16 * 1024;

/** Merges query-string params with an optional small JSON body (POST). Query wins. */
export async function readParams(req: Request, url: URL): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  if (req.method !== 'POST') return query;

  const raw = await req.text();
  if (raw.trim().length === 0) return query;
  if (new TextEncoder().encode(raw).length > MAX_PARAM_BODY_BYTES) throw payloadTooLarge(MAX_PARAM_BODY_BYTES);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw badRequest('INVALID_JSON', 'The request body is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('INVALID_BODY', 'The request body must be a JSON object.');
  }
  return { ...(body as Record<string, unknown>), ...query };
}

export function strParam(params: Record<string, unknown>, name: string, pattern: RegExp, maxLength = 200): string | undefined {
  const value = params[name];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw badRequest('INVALID_PARAMETER', `Parameter "${name}" must be a string.`, { parameter: name });
  }
  const text = String(value).trim();
  if (text.length > maxLength || !pattern.test(text)) {
    throw badRequest('INVALID_PARAMETER', `Parameter "${name}" has an invalid format.`, { parameter: name });
  }
  return text;
}

export function intParam(params: Record<string, unknown>, name: string, fallback: number, min: number, max: number): number {
  const value = params[name];
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw badRequest('INVALID_PARAMETER', `Parameter "${name}" must be an integer between ${min} and ${max}.`, { parameter: name, min, max });
  }
  return parsed;
}

export function boolParam(params: Record<string, unknown>, name: string): boolean {
  const value = params[name];
  return value === true || value === 'true' || value === '1';
}
