import { maskAccountNumber, maskHolderName } from './masking';

describe('masking', () => {
  it.each([
    ['Ana María Gómez', 'Ana M***'],
    ['  Luis   Pérez ', 'Luis P***'],
    ['Ana', 'A***'],
  ])('masks holder name %p', (input, expected) => {
    expect(maskHolderName(input)).toBe(expected);
  });

  it('keeps only the last 4 digits of an account number', () => {
    expect(maskAccountNumber('1000-0000-0042')).toBe('****0042');
  });
});
