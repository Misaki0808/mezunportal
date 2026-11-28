import { describe, expect, it } from 'vitest';

import {
  addDays,
  canClosePosting,
  canEditPosting,
  canPostAnywhere,
  dayOfDateColumn,
  daysBetween,
  daysLeft,
  deadlineProblem,
  isOpen,
  isStudentBelowPostingGrade,
  isUrlOnlyAuthor,
  istanbulDay,
  jobPostingMultiplierPercent,
  meetsStudentPostingGrade,
  postingAuthorRole,
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

describe('ilan yazarı rolü (kart 563: öğrenci yalnız dış bağlantı; kart 571: yalnız 4. sınıf ve üstü)', () => {
  // 26 Kas 2026: akademik yıl 2026 başlangıçlı. Giriş 2023 → 4. sınıf, 2024 → 3., 2025 → 2., 2026 → 1., 2022 → 5. (uzatma).
  const NOW = new Date('2026-11-26T09:00:00Z');
  const member = (
    role: string,
    departmentId = 'A',
    over: Partial<{
      verificationStatus: string;
      endedAt: Date | null;
      entryYear: number | null;
      classOffset: number;
    }> = {},
  ) => ({
    role,
    departmentId,
    verificationStatus: 'VERIFIED',
    endedAt: null,
    entryYear: 2023,
    classOffset: 0,
    ...over,
  });

  it('yalnız o bölümdeki doğrulanmış etkin üyelik sayılır', () => {
    expect(postingAuthorRole([member('STUDENT')], 'A', NOW)).toBe('STUDENT');
    expect(postingAuthorRole([member('STUDENT')], 'B', NOW)).toBeNull();
    expect(
      postingAuthorRole([member('STUDENT', 'A', { verificationStatus: 'PENDING' })], 'A', NOW),
    ).toBeNull();
    expect(
      postingAuthorRole([member('STUDENT', 'A', { endedAt: new Date() })], 'A', NOW),
    ).toBeNull();
    expect(postingAuthorRole([member('MENTOR')], 'A', NOW)).toBeNull();
    expect(postingAuthorRole([], 'A', NOW)).toBeNull();
  });

  it('aynı bölümde mezun/akademisyen öğrenciyi geçer; akademisyen mezunu geçer', () => {
    expect(postingAuthorRole([member('STUDENT'), member('ALUMNI')], 'A', NOW)).toBe('ALUMNI');
    expect(postingAuthorRole([member('ALUMNI'), member('STUDENT')], 'A', NOW)).toBe('ALUMNI');
    expect(postingAuthorRole([member('ALUMNI'), member('ACADEMIC')], 'A', NOW)).toBe('ACADEMIC');
  });

  it.each([
    ['1. sınıf', { entryYear: 2026 }, false],
    ['2. sınıf', { entryYear: 2025 }, false],
    ['3. sınıf', { entryYear: 2024 }, false],
    ['4. sınıf', { entryYear: 2023 }, true],
    ['5. sınıf (uzatma)', { entryYear: 2022 }, true],
    ['uzun uzatma', { entryYear: 2015 }, true],
    ['hazırlık (düzeltme −1 ile ilk yıl)', { entryYear: 2026, classOffset: -1 }, false],
    ['düzeltmeyle 4. sınıf (3. yıl +1)', { entryYear: 2024, classOffset: 1 }, true],
    ['düzeltmeyle 3. sınıfa düşen (4. yıl −1)', { entryYear: 2023, classOffset: -1 }, false],
    ['giriş yılı bilinmiyor', { entryYear: null }, false],
    ['henüz başlamamış (gelecek giriş)', { entryYear: 2027 }, false],
  ])('öğrenci %s → paylaşabilir mi: %s', (_name, over, allowed) => {
    const memberships = [member('STUDENT', 'A', over)];
    expect(meetsStudentPostingGrade(memberships[0]!, NOW)).toBe(allowed);
    expect(postingAuthorRole(memberships, 'A', NOW)).toBe(allowed ? 'STUDENT' : null);
    expect(canPostAnywhere(memberships, NOW)).toBe(allowed);
    expect(isStudentBelowPostingGrade(memberships, 'A', NOW)).toBe(!allowed);
  });

  it('sınıf eşiği İstanbul akademik yıl sınırında geçer: 31 Ağustos 23:59 → 3., 1 Eylül 00:00 → 4. sınıf', () => {
    const third = new Date('2026-08-31T20:59:59Z'); // İstanbul 31 Ağustos 23:59:59 (akademik yıl 2025)
    const fourth = new Date('2026-08-31T21:00:00Z'); // İstanbul 1 Eylül 00:00 (akademik yıl 2026)
    expect(postingAuthorRole([member('STUDENT')], 'A', third)).toBeNull();
    expect(postingAuthorRole([member('STUDENT')], 'A', fourth)).toBe('STUDENT');
  });

  it('mezun ve akademisyen sınıfa bakılmaz (giriş yılı boş ya da yeni olsa da yazar)', () => {
    for (const role of ['ALUMNI', 'ACADEMIC']) {
      expect(postingAuthorRole([member(role, 'A', { entryYear: null })], 'A', NOW)).toBe(role);
      expect(postingAuthorRole([member(role, 'A', { entryYear: 2026 })], 'A', NOW)).toBe(role);
    }
  });

  it('hem 1-2-3. sınıf öğrenci hem mezun: mezun kuralı geçerli, "sınıf yetmiyor" sayılmaz', () => {
    const memberships = [member('STUDENT', 'A', { entryYear: 2026 }), member('ALUMNI', 'A')];
    expect(postingAuthorRole(memberships, 'A', NOW)).toBe('ALUMNI');
    expect(isUrlOnlyAuthor(memberships, 'A', NOW)).toBe(false);
    expect(isStudentBelowPostingGrade(memberships, 'A', NOW)).toBe(false);
  });

  it('bölüm bazlıdır: A bölümünde 4. sınıf, B bölümünde 2. sınıf öğrenci yalnız A için yazar', () => {
    const memberships = [
      member('STUDENT', 'A', { entryYear: 2023 }),
      member('STUDENT', 'B', { entryYear: 2025 }),
    ];
    expect(postingAuthorRole(memberships, 'A', NOW)).toBe('STUDENT');
    expect(postingAuthorRole(memberships, 'B', NOW)).toBeNull();
    expect(isStudentBelowPostingGrade(memberships, 'B', NOW)).toBe(true);
    expect(isStudentBelowPostingGrade(memberships, 'A', NOW)).toBe(false);
    expect(canPostAnywhere(memberships, NOW)).toBe(true);
  });

  it('"sınıf yetmiyor" yalnız doğrulanmış etkin öğrenci üyeliği varken: üyelik yok/beklemede/bitmiş/başka rol → false', () => {
    expect(isStudentBelowPostingGrade([], 'A', NOW)).toBe(false);
    expect(
      isStudentBelowPostingGrade(
        [member('STUDENT', 'A', { entryYear: 2026, verificationStatus: 'PENDING' })],
        'A',
        NOW,
      ),
    ).toBe(false);
    expect(
      isStudentBelowPostingGrade(
        [member('STUDENT', 'A', { entryYear: 2026, endedAt: new Date() })],
        'A',
        NOW,
      ),
    ).toBe(false);
    expect(isStudentBelowPostingGrade([member('MENTOR', 'A', { entryYear: 2026 })], 'A', NOW)).toBe(
      false,
    );
    expect(
      isStudentBelowPostingGrade([member('STUDENT', 'B', { entryYear: 2026 })], 'A', NOW),
    ).toBe(false);
  });

  it('urlOnly: yalnız o bölümde (yeterli sınıfta) öğrenciyse; başka bölümdeki mezunluk öğrenciliği kaldırmaz', () => {
    expect(isUrlOnlyAuthor([member('STUDENT')], 'A', NOW)).toBe(true);
    expect(isUrlOnlyAuthor([member('ALUMNI')], 'A', NOW)).toBe(false);
    expect(isUrlOnlyAuthor([member('ACADEMIC')], 'A', NOW)).toBe(false);
    expect(isUrlOnlyAuthor([member('STUDENT', 'A'), member('ALUMNI', 'B')], 'A', NOW)).toBe(true);
    expect(isUrlOnlyAuthor([member('STUDENT', 'A'), member('ALUMNI', 'A')], 'A', NOW)).toBe(false);
    expect(isUrlOnlyAuthor([], 'A', NOW)).toBe(false); // üyelik yoksa urlOnly değil, yetkisiz (servis ayrıca reddeder)
    expect(isUrlOnlyAuthor([member('STUDENT', 'A', { entryYear: 2026 })], 'A', NOW)).toBe(false); // sınıfı yetmeyen: yazar bile değil
  });
});
