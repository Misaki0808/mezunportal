import { expect, it } from 'vitest';
import {
  compareStoryKeys,
  istanbulMonth,
  storyCursorOf,
  storyKeyAfter,
  type StoryOrderKey,
} from './alumniStory';
it('ay, İstanbul gece yarısında döner; yıl geçişini de kapsar', () => {
  expect(istanbulMonth(new Date('2026-04-30T20:59:59.999Z'))).toBe('2026-04');
  expect(istanbulMonth(new Date('2026-04-30T21:00:00.000Z'))).toBe('2026-05');
  expect(istanbulMonth(new Date('2026-12-31T21:00:00.000Z'))).toBe('2027-01');
});

const KEYS: StoryOrderKey[] = [
  { rank: 90, at: 100, id: 'b' },
  { rank: 90, at: 100, id: 'a' },
  { rank: 90, at: 50, id: 'z' },
  { rank: 40, at: 10, id: 'c' },
  { rank: -1, at: 100, id: 'd' },
  { rank: -1, at: 100, id: 'e' },
];
const shuffled = (items: StoryOrderKey[], seed: number) =>
  items
    .map((item, index) => ({ item, order: (index * 7919 + seed * 104_729) % 97 }))
    .sort((x, y) => x.order - y.order)
    .map((x) => x.item);
it('moderasyon sırası puan ▸ gönderim zamanı ▸ kimlik; girdi sırasından bağımsızdır', () => {
  const expected = ['z', 'a', 'b', 'c', 'd', 'e'];
  for (const seed of [1, 2, 3, 5, 8])
    expect([...shuffled(KEYS, seed)].sort(compareStoryKeys).map((key) => key.id)).toEqual(expected);
});
it('imleç, işaret ettiği kayıttan SONRAKİleri geçirir; kayıt artık listede olmasa da çift/eksik olmaz', () => {
  const ordered = [...KEYS].sort(compareStoryKeys);
  for (const [index, key] of ordered.entries()) {
    const rest = ordered.filter(storyKeyAfter(storyCursorOf(key)));
    expect(rest.map((item) => item.id)).toEqual(ordered.slice(index + 1).map((item) => item.id));
  }
  // İşaret edilen kayıt listeden çıkmış (karara bağlanmış) olsa da devam noktası aynıdır.
  const without = ordered.filter((item) => item.id !== 'a');
  expect(without.filter(storyKeyAfter(storyCursorOf(ordered[1]!))).map((item) => item.id)).toEqual([
    'b',
    'c',
    'd',
    'e',
  ]);
  expect(ordered.filter(storyKeyAfter(undefined))).toEqual(ordered);
});
