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

/** Moderasyon sırası anahtarı: puan (puansız -1), gönderim zamanı (ms), kimlik. */
export type StoryOrderKey = { rank: number; at: number; id: string };
/** Puan çoktan aza, eşitlikte önce gönderilen, sonra kimlik küçükten büyüğe: toplam ve kararlı sıra. */
export const compareStoryKeys = (a: StoryOrderKey, b: StoryOrderKey) =>
  b.rank - a.rank || a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const storyCursorOf = (key: StoryOrderKey) => `${key.rank}:${key.at}:${key.id}`;
/** İmleçteki kayıttan SONRAKİ anahtarları geçirir; imleçteki kayıt artık listede olmasa da sıra korunur. */
export function storyKeyAfter(cursor: string | undefined): (key: StoryOrderKey) => boolean {
  if (!cursor) return () => true;
  const [rank, at, id] = cursor.split(':') as [string, string, string];
  const from: StoryOrderKey = { rank: Number(rank), at: Number(at), id };
  return (key) => compareStoryKeys(from, key) < 0;
}
