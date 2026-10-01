/** "Ana María Gómez" → "Ana M***"; "Ana" → "A***". */
export function maskHolderName(fullName: string): string {
  const [first = '', second] = fullName.trim().split(/\s+/);
  if (!second) return `${first.charAt(0)}***`;
  return `${first} ${second.charAt(0)}***`;
}

/** "1000-0000-0042" → "****0042". */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  return `****${digits.slice(-4)}`;
}
