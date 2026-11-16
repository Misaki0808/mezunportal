/** Yalnız tarih/saat sunumu; profil yüzdesi ve uygunluk kuralları sunucudan gelir. */
export const HOME_TIME_ZONE = 'Europe/Istanbul';

export function homeGreeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('tr-TR', {
      timeZone: HOME_TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  return hour >= 6 && hour < 12
    ? 'morning'
    : hour >= 12 && hour < 18
      ? 'day'
      : hour >= 18 && hour < 22
        ? 'evening'
        : 'night';
}

export function homeDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('tr-TR', { ...options, timeZone: HOME_TIME_ZONE }).format(date);
}
