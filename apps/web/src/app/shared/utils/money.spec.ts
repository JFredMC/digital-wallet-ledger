import { CopPipe } from '../pipes/cop.pipe';
import { formatCop, minorToInput, parseCopInput } from './money';

const plain = (s: string) => s.replace(/\s/g, ' ');

describe('money utils', () => {
  describe('formatCop', () => {
    it('formats whole pesos with Colombian separators and no decimals', () => {
      expect(plain(formatCop(2_500_000))).toBe('$ 25.000');
      expect(plain(formatCop(123_456_700))).toBe('$ 1.234.567');
      expect(plain(formatCop(0))).toBe('$ 0');
    });

    it('shows centavos only when present', () => {
      expect(plain(formatCop(2_500_050))).toBe('$ 25.000,50');
      expect(plain(formatCop(1))).toBe('$ 0,01');
    });
  });

  describe('parseCopInput', () => {
    it.each([
      ['25000', 2_500_000],
      ['25.000', 2_500_000],
      ['1.234.567', 123_456_700],
      ['25.000,5', 2_500_050],
      ['25.000,50', 2_500_050],
      ['$ 25.000,50', 2_500_050],
      [' 0,01 ', 1],
    ])('parses %j as %d minor units', (raw, minor) => {
      expect(parseCopInput(raw)).toBe(minor);
    });

    it.each([
      '',
      'abc',
      '25,000.50',
      '25.00',
      '1.2345',
      '25,123',
      '-5',
      '1e5',
      '99999999999999999',
    ])('rejects %j', (raw) => {
      expect(parseCopInput(raw)).toBeNull();
    });
  });

  it('minorToInput round-trips through parseCopInput', () => {
    for (const minor of [1, 50, 100, 2_500_000, 2_500_050]) {
      expect(parseCopInput(minorToInput(minor))).toBe(minor);
    }
    expect(minorToInput(2_500_000)).toBe('25000');
    expect(minorToInput(2_500_005)).toBe('25000,05');
  });

  it('CopPipe formats and tolerates null', () => {
    const pipe = new CopPipe();
    expect(plain(pipe.transform(5_000_000))).toBe('$ 50.000');
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
