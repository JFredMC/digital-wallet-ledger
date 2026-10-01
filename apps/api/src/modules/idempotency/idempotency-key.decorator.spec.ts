import { parseIdempotencyKey } from './idempotency-key.decorator';

describe('parseIdempotencyKey', () => {
  it('accepts UUIDs and other URL-safe keys of 8–255 characters', () => {
    const uuid = '6f1c2a3e-8a4b-4c1d-9e2f-0a1b2c3d4e5f';
    expect(parseIdempotencyKey(uuid)).toBe(uuid);
    expect(parseIdempotencyKey('order:42.retry_1')).toBe('order:42.retry_1');
    expect(parseIdempotencyKey('k'.repeat(255))).toHaveLength(255);
  });

  it.each([undefined, ''])('requires the header (%p)', (value) => {
    expect(() => parseIdempotencyKey(value)).toThrow(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }),
    );
  });

  it.each([['short'], ['has spaces in it'], ['k'.repeat(256)], [['a'.repeat(8), 'b'.repeat(8)]]])(
    'rejects malformed keys (%p)',
    (value) => {
      expect(() => parseIdempotencyKey(value)).toThrow(
        expect.objectContaining({ code: 'IDEMPOTENCY_KEY_INVALID' }),
      );
    },
  );
});
