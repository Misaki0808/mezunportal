import { describe, expect, it } from 'vitest';

import {
  planMembershipCorrection,
  wouldRemoveLastSystemGrant,
  type CorrectableMembership,
  type CorrectionProblem,
  type MembershipChanges,
} from './membershipCorrection';

const base = (overrides: Partial<CorrectableMembership> = {}): CorrectableMembership => ({
  departmentId: 'dept-a1',
  role: 'STUDENT',
  verificationStatus: 'VERIFIED',
  endedAt: null,
  entryYear: 2023,
  graduationYear: null,
  classOffset: 1,
  ...overrides,
});

const problem = (current: CorrectableMembership, changes: MembershipChanges) => {
  const plan = planMembershipCorrection(current, changes);
  return plan.outcome === 'INVALID' ? plan.problem : plan.outcome;
};

describe('planMembershipCorrection', () => {
  it('etkin ve doğrulanmış olmayan üyelik düzeltilemez', () => {
    expect(problem(base({ endedAt: new Date() }), { entryYear: 2022 })).toBe('NOT_ACTIVE');
    expect(problem(base({ verificationStatus: 'PENDING' }), { entryYear: 2022 })).toBe(
      'NOT_VERIFIED',
    );
    expect(problem(base({ verificationStatus: 'REJECTED' }), { departmentId: 'x' })).toBe(
      'NOT_VERIFIED',
    );
  });

  it('değişiklik yoksa NO_CHANGE; aynı değerler de değişiklik sayılmaz', () => {
    expect(problem(base(), { entryYear: 2023 })).toBe('NO_CHANGE');
    expect(problem(base(), { departmentId: 'dept-a1', role: 'STUDENT' })).toBe('NO_CHANGE');
  });

  it('yalnız yıl değişirse yerinde güncellenir ve düzeltme değeri korunur', () => {
    expect(planMembershipCorrection(base(), { entryYear: 2022 })).toEqual({
      outcome: 'IN_PLACE',
      next: {
        departmentId: 'dept-a1',
        role: 'STUDENT',
        entryYear: 2022,
        graduationYear: null,
        classOffset: 1,
      },
    });
  });

  it('bölüm değişirse eski kapanır, yenisi açılır; öğrencinin düzeltme değeri bölüm değişince de kalır', () => {
    expect(planMembershipCorrection(base(), { departmentId: 'dept-a2' })).toEqual({
      outcome: 'REPLACE',
      next: {
        departmentId: 'dept-a2',
        role: 'STUDENT',
        entryYear: 2023,
        graduationYear: null,
        classOffset: 1,
      },
    });
  });

  it('rol değişince düzeltme değeri sıfırlanır', () => {
    const plan = planMembershipCorrection(base(), { role: 'ALUMNI', graduationYear: 2025 });
    expect(plan).toEqual({
      outcome: 'REPLACE',
      next: {
        departmentId: 'dept-a1',
        role: 'ALUMNI',
        entryYear: 2023,
        graduationYear: 2025,
        classOffset: 0,
      },
    });
  });

  it.each<[string, Partial<CorrectableMembership>, MembershipChanges, CorrectionProblem]>([
    [
      'öğrenciye giriş yılı şart',
      base({ role: 'ALUMNI', entryYear: null, graduationYear: 2020 }),
      { role: 'STUDENT' },
      'ENTRY_YEAR_REQUIRED',
    ],
    ['mezuna mezuniyet yılı şart', {}, { role: 'ALUMNI' }, 'GRADUATION_YEAR_REQUIRED'],
    ['mezuniyet yılı öğrencide yasak', {}, { graduationYear: 2025 }, 'YEAR_NOT_ALLOWED'],
    [
      'akademisyende giriş yılı yasak',
      {},
      { role: 'ACADEMIC', entryYear: 2020 },
      'YEAR_NOT_ALLOWED',
    ],
    [
      'akademisyende mezuniyet yılı yasak',
      {},
      { role: 'ACADEMIC', graduationYear: 2020 },
      'YEAR_NOT_ALLOWED',
    ],
    ['yıl alt sınırı', {}, { entryYear: 1949 }, 'YEAR_RANGE'],
    ['yıl üst sınırı', {}, { entryYear: 2101 }, 'YEAR_RANGE'],
    ['tam sayı olmayan yıl', {}, { entryYear: 2020.5 }, 'YEAR_RANGE'],
    ['mezuniyet girişten önce olamaz', {}, { role: 'ALUMNI', graduationYear: 2020 }, 'YEAR_ORDER'],
  ])('%s', (_name, overrides, changes, expected) => {
    expect(problem(base(overrides), changes)).toBe(expected);
  });

  it('akademisyene geçişte yıllar sessizce temizlenir; mezundan öğrenciye geçişte mezuniyet yılı düşer', () => {
    expect(planMembershipCorrection(base(), { role: 'ACADEMIC' })).toMatchObject({
      outcome: 'REPLACE',
      next: { role: 'ACADEMIC', entryYear: null, graduationYear: null, classOffset: 0 },
    });
    const alumni = base({ role: 'ALUMNI', entryYear: 2018, graduationYear: 2022, classOffset: 0 });
    expect(planMembershipCorrection(alumni, { role: 'STUDENT' })).toMatchObject({
      outcome: 'REPLACE',
      next: { role: 'STUDENT', entryYear: 2018, graduationYear: null },
    });
  });

  it('yılı null ile temizlemek rolün gerektirdiği yılı siler → hata', () => {
    expect(problem(base(), { entryYear: null })).toBe('ENTRY_YEAR_REQUIRED');
    const alumni = base({ role: 'ALUMNI', entryYear: 2018, graduationYear: 2022, classOffset: 0 });
    expect(problem(alumni, { graduationYear: null })).toBe('GRADUATION_YEAR_REQUIRED');
    expect(planMembershipCorrection(alumni, { entryYear: null })).toMatchObject({
      outcome: 'IN_PLACE',
      next: { entryYear: null, graduationYear: 2022 },
    });
  });

  it('rastgele düzeltmelerde plan her zaman veritabanı yıl kısıtlarına uyar', () => {
    const roles = ['STUDENT', 'ALUMNI', 'ACADEMIC'] as const;
    const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)] as T;
    const year = () => pick([undefined, null, 1949, 2015, 2020, 2024, 2101]);
    for (let index = 0; index < 500; index += 1) {
      const current = base({
        role: pick(roles),
        entryYear: pick([null, 2018, 2022]),
        graduationYear: null,
      });
      const plan = planMembershipCorrection(current, {
        role: pick([undefined, ...roles]),
        departmentId: pick([undefined, 'dept-a1', 'dept-b1']),
        entryYear: year(),
        graduationYear: year(),
      });
      if (plan.outcome === 'INVALID') continue;
      const { role, entryYear, graduationYear, classOffset } = plan.next;
      // Membership_years_check ile aynı koşullar
      expect(entryYear === null || (entryYear >= 1950 && entryYear <= 2100)).toBe(true);
      expect(graduationYear === null || (graduationYear >= 1950 && graduationYear <= 2100)).toBe(
        true,
      );
      expect(graduationYear === null || entryYear === null || graduationYear >= entryYear).toBe(
        true,
      );
      expect(graduationYear === null || role === 'ALUMNI').toBe(true);
      expect(role !== 'ACADEMIC' || (entryYear === null && graduationYear === null)).toBe(true);
      expect(role === 'STUDENT' || classOffset === 0).toBe(true);
      if (role === 'STUDENT') expect(entryYear).not.toBeNull();
      if (role === 'ALUMNI') expect(graduationYear).not.toBeNull();
    }
  });
});

describe('wouldRemoveLastSystemGrant', () => {
  it('kaldırılacak dışında silinmemiş kullanıcıya ait etkin sistem yetkisi yoksa true', () => {
    expect(wouldRemoveLastSystemGrant([{ grantId: 'a', userDeleted: false }], 'a')).toBe(true);
    expect(wouldRemoveLastSystemGrant([], 'a')).toBe(true);
    expect(
      wouldRemoveLastSystemGrant(
        [
          { grantId: 'a', userDeleted: false },
          { grantId: 'b', userDeleted: true },
        ],
        'a',
      ),
    ).toBe(true);
  });

  it('başka bir geçerli sistem yetkisi varsa false', () => {
    expect(
      wouldRemoveLastSystemGrant(
        [
          { grantId: 'a', userDeleted: false },
          { grantId: 'b', userDeleted: false },
        ],
        'a',
      ),
    ).toBe(false);
  });
});
