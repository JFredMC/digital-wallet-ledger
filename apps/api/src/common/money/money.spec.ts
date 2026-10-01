import { bigintTransformer, fromJsonAmount, toJsonAmount } from './money';

describe('money helpers', () => {
  it('round-trips BIGINT strings through the transformer', () => {
    expect(bigintTransformer.from('9007199254740993')).toBe(9007199254740993n);
    expect(bigintTransformer.to(42n)).toBe('42');
    expect(bigintTransformer.from(null)).toBeNull();
    expect(bigintTransformer.to(undefined)).toBeUndefined();
  });

  it('converts safe bigint amounts to JSON numbers', () => {
    expect(toJsonAmount(2_500_000n)).toBe(2_500_000);
    expect(toJsonAmount(-15n)).toBe(-15);
  });

  it('refuses amounts beyond Number.MAX_SAFE_INTEGER', () => {
    expect(() => toJsonAmount(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
  });

  it('only accepts safe integers from the API', () => {
    expect(fromJsonAmount(100)).toBe(100n);
    expect(() => fromJsonAmount(1.5)).toThrow(RangeError);
    expect(() => fromJsonAmount(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});
