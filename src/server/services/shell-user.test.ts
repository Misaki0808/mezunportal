import { describe, expect, it } from 'vitest';

import { shellMembershipOf } from './shell-user';

// Akademik yıl eylülde başlar (rules/classYear): 2031-05'te 2024 girişli öğrenci 7. yıldadır; 2028 girişli 3.
const now = new Date('2031-05-10T12:00:00Z');
const department = { code: 'YBS' };

describe('shellMembershipOf: yan menü alt kartı satırı', () => {
  it('öğrenci için sınıf kural dosyasından hesaplanır (giriş yılı + düzeltme)', () => {
    expect(
      shellMembershipOf({ role: 'STUDENT', entryYear: 2028, classOffset: 0, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'GRADE', grade: 3 });
    expect(
      shellMembershipOf({ role: 'STUDENT', entryYear: 2028, classOffset: -1, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'GRADE', grade: 2 });
  });

  it('düzeltme sınıfı sıfırın altına indirirse hazırlıktır', () => {
    expect(
      shellMembershipOf({ role: 'STUDENT', entryYear: 2030, classOffset: -3, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'PREPARATORY' });
  });

  it('giriş yılı yoksa ya da henüz başlamadıysa sınıf yazılmaz (veri uydurulmaz)', () => {
    expect(
      shellMembershipOf({ role: 'STUDENT', entryYear: null, classOffset: 0, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'NONE' });
    expect(
      shellMembershipOf({ role: 'STUDENT', entryYear: 2035, classOffset: 0, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'NONE' });
  });

  it('mezun ve akademisyen sınıf taşımaz; rol yazılır', () => {
    expect(
      shellMembershipOf({ role: 'ALUMNI', entryYear: 2010, classOffset: 0, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'ALUMNI' });
    expect(
      shellMembershipOf({ role: 'ACADEMIC', entryYear: null, classOffset: 0, department }, now),
    ).toEqual({ departmentCode: 'YBS', standing: 'ACADEMIC' });
  });
});
