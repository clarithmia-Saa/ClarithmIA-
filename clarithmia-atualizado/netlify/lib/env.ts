import { configError } from './errors.ts';

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === undefined) throw configError(name);
  return value;
}

export function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Parses `a, b ,c` (or a single value) from one or more variables into a clean list. */
export function listEnv(...names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const raw = optionalEnv(name);
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const value = part.trim();
      if (value) out.push(value);
    }
  }
  return out;
}
