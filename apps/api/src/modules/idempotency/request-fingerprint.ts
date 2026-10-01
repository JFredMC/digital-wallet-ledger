import { createHash } from 'node:crypto';

/** JSON with object keys sorted recursively, so key order never changes the fingerprint. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** SHA-256 (hex) of the operation scope plus the validated request payload. */
export function requestFingerprint(scope: string, payload: unknown): string {
  return createHash('sha256')
    .update(`${scope}\n${canonicalJson(payload)}`)
    .digest('hex');
}
