import { describe, expect, it } from 'vitest';
import {
  DIGEST_MAX_REGENERATIONS,
  digestCycleOfKey,
  digestFingerprint,
  monthlyDigestCycle,
  monthlyDigestKey,
  selectDigest,
  type DigestInput,
} from './digest';
import { queuedEmailSchema } from '../jobs/email-core';

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

describe('özet veri parmak izi (TD-028: bayatlık denetimi metne değil veriye bakar)', () => {
  const base = (): DigestInput => ({
    experiences: [
      { id: 'e1', label: 'Staj' },
      { id: 'e2', label: 'Yarı zamanlı iş' },
    ],
    jobs: [{ id: 'j1', title: 'Junior ERP Danışmanı', organization: 'Örnek A.Ş.' }],
    contribution: { earned: 5, pending: 2 },
    applicationWindows: [{ label: 'Örnek Firma' }],
    events: [{ id: 'v1', label: 'Kariyer günü' }],
  });
  const fp = (input: DigestInput, cycle = '2026-03') =>
    digestFingerprint(selectDigest(input)!, cycle);

  it('aynı veri aynı parmak izi: sıra önemsiz, biçim sabit ve kuyruk şemasından geçer', () => {
    const reordered = { ...base(), experiences: [...base().experiences].reverse() };
    expect(fp(reordered)).toBe(fp(base()));
    expect(fp(base())).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      queuedEmailSchema.safeParse({
        to: 'a@example.invalid',
        subject: 's',
        text: 't',
        template: 'monthlyDigest.summary',
        idempotencyKey: 'k',
        digestFingerprint: fp(base()),
      }).success,
    ).toBe(true);
  });

  it('veri değişince değişir: dönem, deneyim/ilan/etkinlik kimliği, başvuru dönemi, puan', () => {
    const reference = fp(base());
    const changed: Record<string, string> = {
      dönem: fp(base(), '2026-04'),
      deneyim: fp({ ...base(), experiences: [{ id: 'e1', label: 'Staj' }] }),
      'deneyim kimliği': fp({
        ...base(),
        experiences: [
          { id: 'e1', label: 'Staj' },
          { id: 'e3', label: 'Yarı zamanlı iş' },
        ],
      }),
      ilan: fp({ ...base(), jobs: [{ id: 'j2', title: 'X', organization: 'Y' }] }),
      etkinlik: fp({ ...base(), events: [{ id: 'v2', label: 'Kariyer günü' }] }),
      'başvuru dönemi': fp({ ...base(), applicationWindows: [{ label: 'Başka Firma' }] }),
      'kazanılan puan': fp({ ...base(), contribution: { earned: 6, pending: 2 } }),
      'bekleyen puan': fp({ ...base(), contribution: { earned: 5, pending: 3 } }),
    };
    for (const [what, value] of Object.entries(changed)) expect(value, what).not.toBe(reference);
    expect(new Set(Object.values(changed)).size).toBe(Object.keys(changed).length);
  });

  it('metin etiketleri girmez: deneyim türü adı, ilan başlığı/kurumu ve etkinlik başlığı değişse de aynı', () => {
    const relabeled: DigestInput = {
      experiences: [
        { id: 'e1', label: 'FARKLI ETİKET 1' },
        { id: 'e2', label: 'FARKLI ETİKET 2' },
      ],
      jobs: [{ id: 'j1', title: 'Yeniden adlandırılmış ilan', organization: 'Başka Kurum' }],
      contribution: { earned: 5, pending: 2 },
      applicationWindows: [{ label: 'Örnek Firma' }],
      events: [{ id: 'v1', label: 'Yeniden adlandırılmış etkinlik' }],
    };
    expect(fp(relabeled)).toBe(fp(base()));
  });
});

describe('aylık özet anahtarı (kart 307)', () => {
  it('ilk deneme eksiz, yeniden üretim :rN ekli; ay ikisinde de okunur', () => {
    expect(monthlyDigestKey('u1', '2026-03')).toBe('monthly-digest:u1:2026-03');
    expect(monthlyDigestKey('u1', '2026-03', 1)).toBe('monthly-digest:u1:2026-03:r1');
    for (const attempt of [0, 1, 2]) {
      expect(digestCycleOfKey(monthlyDigestKey('u-1_x', '2026-03', attempt))).toBe('2026-03');
    }
  });

  it('başka biçimler ay vermez; abonelik jetonu ve iş eşleşmesi anahtarı karışmaz', () => {
    for (const key of [
      'monthly-digest:u1:2026-3',
      'monthly-digest:u1:2026-03:x1',
      'monthly-digest:u1:2026-03:r',
      'job-match:u1:2026-03-01',
      'u1:2026-03',
      '',
    ]) {
      expect(digestCycleOfKey(key)).toBeUndefined();
    }
  });

  it('yeniden üretim hakkı ay başına tek ve sabit; anahtar kuyruk şemasının sınırını aşmaz', () => {
    expect(DIGEST_MAX_REGENERATIONS).toBe(1);
    const longest = monthlyDigestKey('x'.repeat(64), '2026-03', DIGEST_MAX_REGENERATIONS);
    expect(longest.length).toBeLessThan(200);
  });
});
