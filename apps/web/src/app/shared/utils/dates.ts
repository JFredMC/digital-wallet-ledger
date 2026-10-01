const dateTime = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "1 oct 2026, 9:57 a. m." in the browser's time zone. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** `<input type="date">` value ("2026-10-01", local) → ISO instant at local midnight. */
export function startOfLocalDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** Exclusive upper bound that still includes the whole local day. */
export function endOfLocalDayExclusive(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}
