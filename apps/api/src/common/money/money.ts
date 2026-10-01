import type { ValueTransformer } from 'typeorm';

/**
 * Money is always an integer amount of minor units (e.g. COP centavos).
 * - In PostgreSQL: BIGINT.
 * - In the domain layer: native `bigint` (exact arithmetic, no float rounding).
 * - On the wire (JSON): an integer `number`, validated to stay within
 *   Number.MAX_SAFE_INTEGER (≈ 9.0e15 minor units, far above any wallet amount).
 */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Maps BIGINT columns (returned by `pg` as strings) to `bigint` and back. */
export const bigintTransformer: ValueTransformer = {
  to: (value: bigint | null | undefined) => (value == null ? value : value.toString()),
  from: (value: string | null) => (value == null ? value : BigInt(value)),
};

/** Converts a domain `bigint` amount to a JSON-safe integer. */
export function toJsonAmount(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new RangeError(`Amount ${value} exceeds the JSON-safe integer range`);
  }
  return Number(value);
}

/** Converts a validated integer from the API into a domain amount. */
export function fromJsonAmount(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amount ${value} is not a safe integer`);
  }
  return BigInt(value);
}
