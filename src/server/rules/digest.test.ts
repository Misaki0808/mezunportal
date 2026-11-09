import { describe, expect, it } from 'vitest';
import { monthlyDigestCycle, selectDigest, type DigestInput } from './digest';

const empty = (): DigestInput => ({
  experiences: [],
  jobs: [],
  contribution: null,
  applicationWindows: [],
  events: [],
});

describe('aylık özet seçimi', () => {
  it('boş içerik veya sıfır puan için gönderim üretmez', () => {
    expect(selectDigest(empty())).toBeNull();
    expect(selectDigest({ ...empty(), contribution: { earned: 0, pending: 0 } })).toBeNull();
  });

  it('her bağımsız bölüm tek başına dolu sayılır', () => {
    for (const section of [
      { experiences: [{ id: 'e', label: 'Deneyim' }] },
      { jobs: [{ id: 'j', title: 'İlan', organization: 'Kurum' }] },
      { contribution: { earned: 0, pending: 1 } },
      { applicationWindows: [{ label: 'Kurum' }] },
      { events: [{ id: 'x', label: 'Etkinlik' }] },
    ])
      expect(selectDigest({ ...empty(), ...section })).not.toBeNull();
  });

  it('anonim deneyim dahil kaynak nesnede bulunan yazar alanlarını dışarı taşımayı reddeder', () => {
    const experience = { id: 'e', label: 'Deneyim', authorId: 'secret', authorName: 'Gizli' };
    expect(selectDigest({ ...empty(), experiences: [experience] })?.experiences).toEqual([
      { id: 'e', label: 'Deneyim' },
    ]);
  });

  it('dolu içerikte boş bölümleri sonuçtan çıkarır', () => {
    expect(selectDigest({ ...empty(), contribution: { earned: 3, pending: 1 } })).toEqual({
      contribution: { earned: 3, pending: 1 },
    });
  });

  it.each([
    ['2026-12-31T20:59:59Z', null],
    ['2026-12-31T21:00:00Z', '2027-01'],
    ['2027-01-01T20:59:59Z', '2027-01'],
    ['2027-01-01T21:00:00Z', null],
  ])('İstanbul ay sınırını kullanır: %s', (date, expected) => {
    expect(monthlyDigestCycle(new Date(date))).toBe(expected);
  });
});
