import { canonicalJson, requestFingerprint } from './request-fingerprint';

describe('request fingerprint', () => {
  it('ignores key order and undefined fields', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[1,{"y":2,"z":1}]},"b":1}',
    );
    expect(requestFingerprint('POST /x', { a: 1, b: 2 })).toBe(
      requestFingerprint('POST /x', { b: 2, a: 1, c: undefined }),
    );
  });

  it('changes with the payload or the scope', () => {
    const base = requestFingerprint('POST /transfers', { amountMinor: 100 });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(requestFingerprint('POST /transfers', { amountMinor: 101 })).not.toBe(base);
    expect(requestFingerprint('POST /deposits', { amountMinor: 100 })).not.toBe(base);
  });
});
