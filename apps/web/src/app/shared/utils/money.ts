/**
 * Money is handled as integer minor units (COP centavos, 2 digits) end to end;
 * these helpers only convert at the UI edge.
 */

const withCents = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholePesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 2500000 → "$ 25.000"; 2500050 → "$ 25.000,50" (centavos only when present). */
export function formatCop(amountMinor: number): string {
  const formatter = amountMinor % 100 === 0 ? wholePesos : withCents;
  return formatter.format(amountMinor / 100);
}

/**
 * Parses what a Colombian user types as an amount in pesos into minor units.
 * Accepts "25000", "25.000", "25.000,5", "$ 25.000,50". Dots are thousands
 * separators and the comma is the decimal separator. Returns null if invalid.
 */
export function parseCopInput(raw: string): number | null {
  const value = raw.replace(/[\s$\u00a0]/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const pesos = Number(match[1].replace(/\./g, ''));
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = pesos * 100 + cents;
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units → plain input text in pesos ("25000" or "25000,5"). */
export function minorToInput(amountMinor: number): string {
  const pesos = Math.trunc(amountMinor / 100);
  const cents = amountMinor % 100;
  return cents === 0 ? String(pesos) : `${pesos},${String(cents).padStart(2, '0')}`;
}
