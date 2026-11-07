import { describe, expect, it } from 'vitest';

import {
  academicYearStartOf,
  computeClassStanding,
  isUpperClass,
  isValidClassOffset,
  type ClassStanding,
} from './classYear';

// Bugün (7 Kasım 2026) akademik yıl 2026-27'dir.
const NOW = new Date('2026-11-07T12:00:00+03:00');

describe('academicYearStartOf (Europe/Istanbul, Eylül başı)', () => {
  it.each([
    ['2026-09-01T00:00:00+03:00', 2026],
    ['2026-08-31T23:59:59+03:00', 2025],
    ['2027-06-30T12:00:00+03:00', 2026],
    ['2027-01-15T12:00:00+03:00', 2026],
    ['2026-12-31T23:59:59+03:00', 2026],
  ])('%s → %i', (instant, expected) => {
    expect(academicYearStartOf(new Date(instant))).toBe(expected);
  });

  it('UTC değil İstanbul takvimine bakar (UTC 31 Ağustos 21:00 = İstanbul 1 Eylül 00:00)', () => {
    expect(academicYearStartOf(new Date('2026-08-31T20:59:59Z'))).toBe(2025);
    expect(academicYearStartOf(new Date('2026-08-31T21:00:00Z'))).toBe(2026);
  });
});

describe('computeClassStanding', () => {
  const grade = (value: number, extended = false): ClassStanding => ({
    kind: 'GRADE',
    grade: value,
    extended,
  });

  it.each<[string, { entryYear: number | null; classOffset?: number }, ClassStanding]>([
    ['bu yıl giren: 1. sınıf', { entryYear: 2026 }, grade(1)],
    ['geçen yıl giren: 2. sınıf', { entryYear: 2025 }, grade(2)],
    ['3. sınıf', { entryYear: 2024 }, grade(3)],
    ['4. sınıf (normal sürenin son yılı)', { entryYear: 2023 }, grade(4)],
    ['uzatma: 5. yıl', { entryYear: 2022 }, grade(5, true)],
    ['uzatma: 7. yıl', { entryYear: 2020 }, grade(7, true)],
    [
      'hazırlık: ilk yıl, düzeltme −1',
      { entryYear: 2026, classOffset: -1 },
      { kind: 'PREPARATORY' },
    ],
    ['hazırlıktan sonraki yıl 1. sınıf', { entryYear: 2025, classOffset: -1 }, grade(1)],
    [
      'dondurulan yıl (−1): 3. yıldaki öğrenci 2. sınıf',
      { entryYear: 2024, classOffset: -1 },
      grade(2),
    ],
    ['intibak (+1): 1. yıldaki öğrenci 2. sınıf', { entryYear: 2026, classOffset: 1 }, grade(2)],
    ['uzatma düzeltmeyle 4. sınıfa iner', { entryYear: 2022, classOffset: -1 }, grade(4)],
    ['henüz başlamamış (gelecek giriş yılı)', { entryYear: 2027 }, { kind: 'NOT_STARTED' }],
    ['giriş yılı yok', { entryYear: null }, { kind: 'UNKNOWN' }],
  ])('%s', (_label, input, expected) => {
    expect(computeClassStanding(input, NOW)).toEqual(expected);
  });

  it('Eylül sınırında sınıf atlar (31 Ağustos 2. sınıf, 1 Eylül 3. sınıf)', () => {
    const input = { entryYear: 2024 };
    expect(computeClassStanding(input, new Date('2026-08-31T23:59:59+03:00'))).toEqual(grade(2));
    expect(computeClassStanding(input, new Date('2026-09-01T00:00:00+03:00'))).toEqual(grade(3));
  });

  it('düzeltme aralığı dışında RangeError verir', () => {
    expect(() => computeClassStanding({ entryYear: 2024, classOffset: 4 }, NOW)).toThrow(
      RangeError,
    );
    expect(() => computeClassStanding({ entryYear: 2024, classOffset: -4 }, NOW)).toThrow(
      RangeError,
    );
    expect(() => computeClassStanding({ entryYear: 2024, classOffset: 0.5 }, NOW)).toThrow(
      RangeError,
    );
  });
});

describe('isUpperClass (K-08: 3. sınıf ve üstü)', () => {
  it.each<[string, { entryYear: number | null; classOffset?: number }, boolean]>([
    ['1. sınıf', { entryYear: 2026 }, false],
    ['2. sınıf', { entryYear: 2025 }, false],
    ['3. sınıf', { entryYear: 2024 }, true],
    ['4. sınıf', { entryYear: 2023 }, true],
    ['uzatmadaki öğrenci üst sınıftır', { entryYear: 2021 }, true],
    ['hazırlıktaki öğrenci üst sınıf değildir', { entryYear: 2026, classOffset: -1 }, false],
    ['başlamamış öğrenci üst sınıf değildir', { entryYear: 2027 }, false],
    ['giriş yılı bilinmeyen üst sınıf sayılmaz', { entryYear: null }, false],
  ])('%s → %s', (_label, input, expected) => {
    expect(isUpperClass(computeClassStanding(input, NOW))).toBe(expected);
  });
});

describe('isValidClassOffset', () => {
  it.each([
    [-3, true],
    [0, true],
    [3, true],
    [-4, false],
    [4, false],
    [1.5, false],
    [Number.NaN, false],
  ])('%s → %s', (value, expected) => {
    expect(isValidClassOffset(value)).toBe(expected);
  });
});
