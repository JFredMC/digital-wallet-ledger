import { FormControl } from '@angular/forms';
import { copAmountValidator, safeReturnUrl } from './validators';

describe('copAmountValidator', () => {
  const validate = (value: string, max?: number | null) =>
    copAmountValidator(max === undefined ? undefined : () => max)(new FormControl(value));

  it('leaves empty values to `required`', () => {
    expect(validate('')).toBeNull();
    expect(validate('   ')).toBeNull();
  });

  it('accepts valid peso amounts', () => {
    expect(validate('25.000')).toBeNull();
    expect(validate('0,01')).toBeNull();
  });

  it('flags malformed and zero amounts', () => {
    expect(validate('25,000.00')).toEqual({ copAmount: true });
    expect(validate('0')).toEqual({ copMin: true });
  });

  it('enforces the dynamic maximum (e.g. the balance)', () => {
    expect(validate('100.001', 10_000_000)).toEqual({ copMax: { max: 10_000_000 } });
    expect(validate('100.000', 10_000_000)).toBeNull();
    expect(validate('999.999', null)).toBeNull();
  });
});

describe('safeReturnUrl', () => {
  it('keeps same-app relative paths', () => {
    expect(safeReturnUrl('/movimientos?type=DEPOSIT')).toBe('/movimientos?type=DEPOSIT');
  });

  it.each([
    undefined,
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('falls back for %j', (url) => {
    expect(safeReturnUrl(url)).toBe('/inicio');
  });
});
