import { describe, expect, it } from 'vitest';

import {
  awardStatus,
  bothSidesConfirmed,
  isFoundingEligible,
  pointsOf,
  sessionActionFor,
  sessionMultiplierPercent,
} from './points';
import {
  SUSPICION_THRESHOLDS,
  detectBurst,
  detectSingleCounterpart,
  detectSyncFeedback,
  type ScanEntry,
  type SyncSession,
} from './pointsSuspicion';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const d = (iso: string) => new Date(iso);

describe('pointsOf', () => {
  it.each([
    [10, 100, 10],
    [10, 50, 5],
    [10, 25, 2], // 2,5 → aşağı
    [15, 25, 3], // 3,75 → aşağı
    [3, 50, 1], // 1,5 → aşağı
    [5, 25, 1],
    [1, 25, 0],
    [10, 0, 0],
    [0, 100, 0],
  ])('%i puan × %i%% = %i', (base, percent, expected) => {
    expect(pointsOf(base, percent)).toBe(expected);
  });
  it('geçersiz girdiyi reddeder', () => {
    expect(() => pointsOf(-1, 100)).toThrow(RangeError);
    expect(() => pointsOf(1.5, 100)).toThrow(RangeError);
    expect(() => pointsOf(10, 101)).toThrow(RangeError);
    expect(() => pointsOf(10, -1)).toThrow(RangeError);
    expect(() => pointsOf(10, 0.5)).toThrow(RangeError);
  });
});

describe('sessionMultiplierPercent (ikili tavanı + azalan çarpan)', () => {
  const at = d('2030-06-15T10:00:00Z');
  it('ilk görüşme tam puan', () => {
    expect(sessionMultiplierPercent(at, [])).toBe(100);
  });
  it('aynı İstanbul ayında ikinci görüşme 0 (önce ya da sonra yazılmış olması fark etmez)', () => {
    expect(sessionMultiplierPercent(at, [d('2030-06-02T10:00:00Z')])).toBe(0);
    expect(sessionMultiplierPercent(at, [d('2030-06-28T10:00:00Z')])).toBe(0);
  });
  it('ay sınırı İstanbul saatine göredir (UTC+3)', () => {
    // 2030-05-31T21:30Z = 1 Haziran 00:30 İstanbul → Haziran
    expect(sessionMultiplierPercent(d('2030-06-10T10:00:00Z'), [d('2030-05-31T21:30:00Z')])).toBe(
      0,
    );
    // 2030-05-31T20:30Z = 31 Mayıs 23:30 İstanbul → Mayıs
    expect(sessionMultiplierPercent(d('2030-06-10T10:00:00Z'), [d('2030-05-31T20:30:00Z')])).toBe(
      50,
    );
  });
  it('180 gün içinde önceki puanlı görüşme sayısına göre 100 → 50 → 25', () => {
    const one = [d('2030-05-10T10:00:00Z')];
    const two = [...one, d('2030-04-10T10:00:00Z')];
    const three = [...two, d('2030-03-10T10:00:00Z')];
    expect(sessionMultiplierPercent(at, one)).toBe(50);
    expect(sessionMultiplierPercent(at, two)).toBe(25);
    expect(sessionMultiplierPercent(at, three)).toBe(25);
  });
  it('180 günden eski görüşme sayılmaz (sınır dahil değil)', () => {
    const exactly = new Date(at.getTime() - 180 * DAY);
    const justInside = new Date(at.getTime() - 180 * DAY + 1);
    expect(sessionMultiplierPercent(at, [exactly])).toBe(100);
    expect(sessionMultiplierPercent(at, [justInside])).toBe(50);
  });
  it('sonraki aylardaki görüşmeler azalmaya katılmaz', () => {
    expect(sessionMultiplierPercent(at, [d('2030-08-10T10:00:00Z')])).toBe(100);
  });
});

describe('awardStatus', () => {
  const event = d('2030-06-15T10:00:00Z');
  it('gecikmesiz eylem hemen FINAL', () => {
    expect(awardStatus(0, event, event)).toEqual({ status: 'FINAL', finalizesAt: null });
  });
  it('gecikme dolmadan PENDING, dolunca FINAL', () => {
    const due = new Date(event.getTime() + 7 * DAY);
    expect(awardStatus(7, event, new Date(due.getTime() - 1))).toEqual({
      status: 'PENDING',
      finalizesAt: due,
    });
    expect(awardStatus(7, event, due)).toEqual({ status: 'FINAL', finalizesAt: due });
  });
  it('geçersiz gecikmeyi reddeder', () => {
    expect(() => awardStatus(-1, event, event)).toThrow(RangeError);
    expect(() => awardStatus(0.5, event, event)).toThrow(RangeError);
  });
});

describe('sessionActionFor / bothSidesConfirmed / isFoundingEligible', () => {
  it('biçim → eylem', () => {
    expect(sessionActionFor('ONLINE')).toBe('SESSION_ONLINE');
    expect(sessionActionFor('IN_PERSON')).toBe('SESSION_IN_PERSON');
  });
  const yes = (authorId: string) => ({ authorId, happened: true });
  it.each([
    ['COMPLETED', [yes('m'), yes('s')], 'm', 's', true],
    ['COMPLETED', [yes('m')], 'm', 's', false],
    ['COMPLETED', [yes('s')], 'm', 's', false],
    ['COMPLETED', [yes('m'), { authorId: 's', happened: false }], 'm', 's', false],
    ['CONFIRMED', [yes('m'), yes('s')], 'm', 's', false],
    ['NO_SHOW', [yes('m'), yes('s')], 'm', 's', false],
    ['COMPLETED', [yes('x'), yes('y')], 'm', 's', false],
    ['COMPLETED', [yes('m')], 'm', 'm', false],
  ] as const)('%s %j → %s', (status, feedbacks, mentor, mentee, expected) => {
    expect(bothSidesConfirmed(status, feedbacks, mentor, mentee)).toBe(expected);
  });
  it('kurucu üye: anonim etiket doğurmaz, pilot sınırı dahil', () => {
    const until = d('2030-12-31T00:00:00Z');
    const base = { anonymous: false, publishedAt: d('2030-06-01T00:00:00Z'), until };
    expect(isFoundingEligible(base)).toBe(true);
    expect(isFoundingEligible({ ...base, anonymous: true })).toBe(false);
    expect(isFoundingEligible({ ...base, publishedAt: until })).toBe(true);
    expect(isFoundingEligible({ ...base, publishedAt: new Date(until.getTime() + 1) })).toBe(false);
    expect(isFoundingEligible({ ...base, until: null })).toBe(true);
  });
});

const entry = (
  id: string,
  points: number,
  iso: string,
  counterpartId: string | null = null,
): ScanEntry => ({
  id,
  points,
  eventAt: d(iso),
  counterpartId,
});

describe('detectBurst', () => {
  it('24 saat içinde 40 puan ve üstü işaretlenir', () => {
    const found = detectBurst([
      entry('a', 15, '2030-06-10T08:00:00Z'),
      entry('b', 15, '2030-06-10T12:00:00Z'),
      entry('c', 10, '2030-06-11T07:59:59Z'),
    ]);
    expect(found).toMatchObject({ rule: 'BURST', points: 40, entryIds: ['a', 'b', 'c'] });
    expect(found?.windowStart).toEqual(d('2030-06-10T08:00:00Z'));
    expect(found?.windowEnd).toEqual(d('2030-06-11T07:59:59Z'));
  });
  it('39 puan ya da pencere dışı (tam 24 saat) işaretlenmez', () => {
    expect(
      detectBurst([entry('a', 15, '2030-06-10T08:00:00Z'), entry('b', 24, '2030-06-10T09:00:00Z')]),
    ).toBeNull();
    expect(
      detectBurst([entry('a', 20, '2030-06-10T08:00:00Z'), entry('b', 20, '2030-06-11T08:00:00Z')]),
    ).toBeNull();
  });
  it('en çok puanlı pencereyi seçer; sıfır puanlı kayıt ve boş girdi işaret üretmez', () => {
    const found = detectBurst([
      entry('z', 0, '2030-06-01T00:00:00Z'),
      entry('a', 20, '2030-06-02T00:00:00Z'),
      entry('b', 20, '2030-06-02T01:00:00Z'),
      entry('c', 25, '2030-06-20T00:00:00Z'),
      entry('d', 25, '2030-06-20T01:00:00Z'),
    ]);
    expect(found?.entryIds).toEqual(['c', 'd']);
    expect(found?.points).toBe(50);
    expect(detectBurst([])).toBeNull();
  });
  it('eşit puanlı iki pencerede en erkeni seçilir; sıfır puanlı kayıt işarete girmez', () => {
    const found = detectBurst([
      entry('a', 20, '2030-06-02T00:00:00Z'),
      entry('z', 0, '2030-06-02T01:00:00Z'),
      entry('b', 20, '2030-06-02T02:00:00Z'),
      entry('c', 20, '2030-06-20T00:00:00Z'),
      entry('d', 20, '2030-06-20T02:00:00Z'),
    ]);
    expect(found?.entryIds).toEqual(['a', 'b']);
    expect(found?.windowStart).toEqual(d('2030-06-02T00:00:00Z'));
  });
  it('eşik ve pencere sabitleri K-11 ile uyumlu', () => {
    expect(SUSPICION_THRESHOLDS.burstPoints).toBe(40);
    expect(SUSPICION_THRESHOLDS.burstWindowHours).toBe(24);
  });
});

describe('detectSingleCounterpart', () => {
  const now = d('2030-07-01T00:00:00Z');
  const make = (n: number, other = 0) => [
    ...Array.from({ length: n }, (_, i) =>
      entry(`s${i}`, 10, `2030-06-${10 + i}T10:00:00Z`, 'stu'),
    ),
    ...Array.from({ length: other }, (_, i) =>
      entry(`o${i}`, 10, `2030-06-${20 + i}T10:00:00Z`, `x${i}`),
    ),
  ];
  it('tek karşı taraftan ≥ 3 kayıt ve ≥ %60 pay işaretlenir', () => {
    const found = detectSingleCounterpart(make(3, 1), now); // 30/40 = %75
    expect(found).toMatchObject({ rule: 'SINGLE_COUNTERPART', sharePercent: 75, points: 30 });
    expect(found?.entryIds).toEqual(['s0', 's1', 's2']);
  });
  it('pay %60 sınırı dahil, altı değil', () => {
    expect(detectSingleCounterpart(make(3, 2), now)?.sharePercent).toBe(60); // 30/50
    expect(detectSingleCounterpart(make(3, 3), now)).toBeNull(); // 30/60 = %50
  });
  it('2 kayıt, toplam < 15 puan ya da pencere dışı işaretlenmez', () => {
    expect(detectSingleCounterpart(make(2), now)).toBeNull();
    const small = [
      entry('a', 4, '2030-06-10T10:00:00Z', 'stu'),
      entry('b', 4, '2030-06-11T10:00:00Z', 'stu'),
      entry('c', 4, '2030-06-12T10:00:00Z', 'stu'),
    ];
    expect(detectSingleCounterpart(small, now)).toBeNull(); // toplam 12 < 15
    expect(detectSingleCounterpart(make(3), d('2030-12-01T00:00:00Z'))).toBeNull();
  });
  it('toplam tabanı (15) dahil; karşı tarafsız kayıtlar tek başına işaret üretmez', () => {
    const exactly = [
      entry('a', 5, '2030-06-10T10:00:00Z', 'stu'),
      entry('b', 5, '2030-06-11T10:00:00Z', 'stu'),
      entry('c', 5, '2030-06-12T10:00:00Z', 'stu'),
    ];
    expect(detectSingleCounterpart(exactly, now)?.points).toBe(15);
    const withoutCounterpart = [1, 2, 3].map((i) => entry(`e${i}`, 10, `2030-06-0${i}T10:00:00Z`));
    expect(detectSingleCounterpart(withoutCounterpart, now)).toBeNull();
  });
  it('karşı tarafsız kayıtlar (deneyim) paya girmez ama toplama girer', () => {
    const list = [...make(3), entry('e', 30, '2030-06-25T10:00:00Z', null)]; // 30/60 = %50
    expect(detectSingleCounterpart(list, now)).toBeNull();
  });
});

describe('detectSyncFeedback', () => {
  const now = d('2030-07-01T00:00:00Z');
  const session = (id: string, day: number, gapMs: number, counterpartId = 'stu'): SyncSession => ({
    entryId: id,
    counterpartId,
    eventAt: d(`2030-0${day > 30 ? 6 : 5}-${String((day % 30) + 1).padStart(2, '0')}T10:00:00Z`),
    mentorFeedbackAt: d('2030-06-01T12:00:00Z'),
    menteeFeedbackAt: new Date(d('2030-06-01T12:00:00Z').getTime() + gapMs),
  });
  const points = () => 10;
  it('aynı ikilide ≥ 3 eşzamanlı yanıt işaretlenir (60 sn dahil)', () => {
    const found = detectSyncFeedback(
      [session('a', 1, 0), session('b', 2, 30_000), session('c', 3, 60_000)],
      now,
      points,
    );
    expect(found).toMatchObject({ rule: 'SYNC_FEEDBACK', syncedCount: 3, points: 30 });
    expect(found?.entryIds).toEqual(['a', 'b', 'c']);
  });
  it('61 sn fark, 2 görüşme ya da farklı ikililer işaret üretmez', () => {
    expect(
      detectSyncFeedback(
        [session('a', 1, 0), session('b', 2, 0), session('c', 3, 61_000)],
        now,
        points,
      ),
    ).toBeNull();
    expect(detectSyncFeedback([session('a', 1, 0), session('b', 2, 0)], now, points)).toBeNull();
    expect(
      detectSyncFeedback(
        [session('a', 1, 0, 'x'), session('b', 2, 0, 'y'), session('c', 3, 0, 'z')],
        now,
        points,
      ),
    ).toBeNull();
  });
  it('tam 180 gün önceki görüşme pencere dışıdır', () => {
    const edge = { ...session('a', 1, 0), eventAt: new Date(now.getTime() - 180 * DAY) };
    expect(
      detectSyncFeedback([edge, session('b', 2, 0), session('c', 3, 0)], now, points),
    ).toBeNull();
    const inside = { ...edge, eventAt: new Date(now.getTime() - 180 * DAY + 1) };
    expect(
      detectSyncFeedback([inside, session('b', 2, 0), session('c', 3, 0)], now, points),
    ).not.toBeNull();
  });
  it('yanıt sırası önemsiz (öğrenci önce yanıtlasa da), 180 gün dışı sayılmaz', () => {
    const early = { ...session('a', 1, 0), menteeFeedbackAt: d('2030-06-01T11:59:30Z') };
    expect(
      detectSyncFeedback([early, session('b', 2, 0), session('c', 3, 0)], now, points)?.syncedCount,
    ).toBe(3);
    expect(
      detectSyncFeedback(
        [session('a', 1, 0), session('b', 2, 0), session('c', 3, 0)],
        d('2031-06-01T00:00:00Z'),
        points,
      ),
    ).toBeNull();
  });
});
