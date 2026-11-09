/** Ay sınırı daima İstanbul takvimidir; UTC ayı burada kullanılamaz. */
export function istanbulMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  if (!year || !month) throw new RangeError('invalid date');
  return `${year}-${month}`;
}
