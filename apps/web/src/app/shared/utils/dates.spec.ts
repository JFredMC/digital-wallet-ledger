import { endOfLocalDayExclusive, formatDateTime, startOfLocalDay } from './dates';

describe('date utils', () => {
  it('turns a date input into a whole local day [start, end)', () => {
    const start = new Date(startOfLocalDay('2026-10-01'));
    const end = new Date(endOfLocalDayExclusive('2026-10-01'));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(2);
    expect(end.getHours()).toBe(0);
  });

  it('handles month ends', () => {
    expect(new Date(endOfLocalDayExclusive('2026-12-31')).getFullYear()).toBe(2027);
  });

  it('formats in Spanish', () => {
    expect(formatDateTime('2026-10-01T14:57:00.000Z')).toMatch(/oct/);
  });
});
