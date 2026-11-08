import { describe, expect, it } from 'vitest';

import {
  addDays,
  canClosePosting,
  canEditPosting,
  dayOfDateColumn,
  daysBetween,
  daysLeft,
  deadlineProblem,
  isOpen,
  istanbulDay,
  jobPostingMultiplierPercent,
} from './jobPosting';

describe('İstanbul takvim günü', () => {
  it.each([
    ['2030-06-20T12:00:00Z', '2030-06-20'],
    ['2030-06-20T20:59:59.999Z', '2030-06-20'],
    ['2030-06-20T21:00:00Z', '2030-06-21'], // İstanbul gece yarısı
    ['2030-12-31T21:00:00Z', '2031-01-01'],
    ['2030-03-01T00:00:00Z', '2030-03-01'],
  ])('%s → %s', (iso, day) => expect(istanbulDay(new Date(iso))).toBe(day));

  it('gün aritmetiği ay ve yıl sınırlarını aşar; artık yıl', () => {
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
    expect(addDays('2030-12-31', 1)).toBe('2031-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2030-03-01', -1)).toBe('2030-02-28');
    expect(daysBetween('2030-06-20', '2030-08-19')).toBe(60);
    expect(daysBetween('2030-06-20', '2030-06-19')).toBe(-1);
    expect(dayOfDateColumn(new Date('2030-07-01T00:00:00Z'))).toBe('2030-07-01');
  });
});

describe('son başvuru günü kuralı', () => {
  const today = '2030-06-20';
  it.each([
    ['dün', '2030-06-19', null, 'PAST'],
    ['bugün', '2030-06-20', null, null],
    ['yarın', '2030-06-21', null, null],
    ['60. gün (dahil)', '2030-08-19', null, null],
    ['61. gün', '2030-08-20', null, 'TOO_FAR'],
    [
      'bekleme sonrası yayın: yayın günü temel (bugün 25 Haz, yayın 25 Haz)',
      '2030-08-19',
      '2030-06-25',
      null,
    ],
    ['yayın günü temel: 60 günü aşar', '2030-08-25', '2030-06-25', 'TOO_FAR'],
  ])('%s', (_name, deadline, base, expected) => {
    expect(deadlineProblem(deadline, base ?? today, base ?? today)).toBe(expected);
  });

  it('yayında bugün < temel olamaz ama geçmiş tarih her zaman PAST önceliklidir', () => {
    expect(deadlineProblem('2030-06-19', '2030-06-25', '2030-06-25')).toBe('PAST');
    expect(deadlineProblem('2030-06-30', '2030-06-25', '2030-06-20')).toBeNull();
  });

  it('kalan gün: bugün son gün 0, yarın 1, geçmiş negatif', () => {
    expect(daysLeft('2030-06-20', today)).toBe(0);
    expect(daysLeft('2030-06-21', today)).toBe(1);
    expect(daysLeft('2030-06-19', today)).toBe(-1);
  });
});

describe('açıklık ve durum kuralları', () => {
  const today = '2030-06-20';
  it('yalnız yayında ve son gün bugün/sonrası açıktır', () => {
    expect(isOpen({ status: 'PUBLISHED', deadlineOn: '2030-06-20' }, today)).toBe(true);
    expect(isOpen({ status: 'PUBLISHED', deadlineOn: '2030-06-19' }, today)).toBe(false);
    expect(isOpen({ status: 'PUBLISHED', deadlineOn: null }, today)).toBe(false);
    for (const status of ['DRAFT', 'PENDING', 'REJECTED', 'EXPIRED', 'CLOSED'] as const)
      expect(isOpen({ status, deadlineOn: '2030-07-01' }, today)).toBe(false);
  });
  it('düzenleme: yalnız DRAFT/REJECTED; çekme: yalnız PENDING/PUBLISHED', () => {
    expect(
      (['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'CLOSED'] as const).filter(
        canEditPosting,
      ),
    ).toEqual(['DRAFT', 'REJECTED']);
    expect(
      (['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'CLOSED'] as const).filter(
        canClosePosting,
      ),
    ).toEqual(['PENDING', 'PUBLISHED']);
  });
});

describe('ilan puanı aylık tavanı (ayda en çok 3 ilan puan getirir)', () => {
  const at = new Date('2030-06-15T10:00:00Z');
  const inJune = (days: number) => new Date(Date.UTC(2030, 5, days, 9));
  it.each([
    ['ilk ilan', [], 100],
    ['ikinci', [inJune(1)], 100],
    ['üçüncü', [inJune(1), inJune(2)], 100],
    ['dördüncü', [inJune(1), inJune(2), inJune(3)], 0],
    ['beşinci', [inJune(1), inJune(2), inJune(3), inJune(4)], 0],
  ])('%s → %i', (_name, scored, expected) => {
    expect(jobPostingMultiplierPercent(at, scored)).toBe(expected);
  });

  it('başka aydaki ilanlar sayılmaz; İstanbul ay sınırı: 30 Haz 21:00Z = 1 Temmuz', () => {
    const may = new Date('2030-05-20T09:00:00Z');
    expect(jobPostingMultiplierPercent(at, [may, may, may, may])).toBe(100);
    const julyFirst = new Date('2030-06-30T21:00:00Z'); // İstanbul 1 Temmuz 00:00
    expect(jobPostingMultiplierPercent(at, [julyFirst, julyFirst, julyFirst])).toBe(100);
    expect(jobPostingMultiplierPercent(julyFirst, [julyFirst, julyFirst, julyFirst])).toBe(0);
    const juneLast = new Date('2030-06-30T20:59:00Z'); // İstanbul 30 Haziran 23:59
    expect(jobPostingMultiplierPercent(at, [juneLast, juneLast, juneLast])).toBe(0);
  });
});
