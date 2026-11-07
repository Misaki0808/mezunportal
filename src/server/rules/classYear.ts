/**
 * Sınıf hesaplama (D4). Sınıf SAKLANMAZ: giriş yılı ve kullanıcının girdiği düzeltme değerinden,
 * akademik yıla göre hesaplanır. Saf işlev; saat dışarıdan verilir.
 *
 * Etkin sınıf = (akademik yıl − giriş yılı + 1) + düzeltme.
 *   - Düzeltme hazırlık (−1), dondurulan yıl (−1) gibi durumları; yatay geçiş/intibak gibi durumlarda
 *     pozitif değer taşır.
 *   - Etkin sınıf 1'in altındaysa kişi hazırlıktadır.
 *   - Normal program süresini (4 yıl) aşan öğrenci “uzatma”dadır; sınıfı sayı olarak büyümeye devam eder
 *     (K-08 eşiği “3. sınıf ve üstü” uzatmadakileri de kapsar).
 */

/** Akademik yıl Eylül'de başlar (Europe/Istanbul). Eylül'ün ilk günü yeni sınıfa geçiş sayılır. */
export const ACADEMIC_YEAR_START_MONTH = 9;
export const NORMAL_PROGRAM_YEARS = 4;
/** K-08 (PM önerisi): “üst sınıf” 3. sınıf ve üstüdür. */
export const UPPER_CLASS_MIN_GRADE = 3;
/** Düzeltme değerinin izinli aralığı; veritabanı kısıtı (Membership_years_check) ile aynıdır. */
export const CLASS_OFFSET_MIN = -3;
export const CLASS_OFFSET_MAX = 3;

export type ClassStanding =
  | { kind: 'UNKNOWN' }
  | { kind: 'NOT_STARTED' }
  | { kind: 'PREPARATORY' }
  | { kind: 'GRADE'; grade: number; extended: boolean };

export function isValidClassOffset(value: number): boolean {
  return Number.isInteger(value) && value >= CLASS_OFFSET_MIN && value <= CLASS_OFFSET_MAX;
}

/** `now` anının Europe/Istanbul takvimine göre içinde bulunulan akademik yılın BAŞLANGIÇ yılı. */
export function academicYearStartOf(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new RangeError('Geçersiz tarih');
  }
  return month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
}

export function computeClassStanding(
  input: { entryYear: number | null; classOffset?: number },
  now: Date,
): ClassStanding {
  const { entryYear, classOffset = 0 } = input;
  if (entryYear === null) return { kind: 'UNKNOWN' };
  if (!isValidClassOffset(classOffset)) {
    throw new RangeError(`Sınıf düzeltmesi ${CLASS_OFFSET_MIN}…${CLASS_OFFSET_MAX} olmalı`);
  }

  const yearsSinceEntry = academicYearStartOf(now) - entryYear + 1;
  if (yearsSinceEntry < 1) return { kind: 'NOT_STARTED' };

  const grade = yearsSinceEntry + classOffset;
  if (grade < 1) return { kind: 'PREPARATORY' };
  return { kind: 'GRADE', grade, extended: grade > NORMAL_PROGRAM_YEARS };
}

/** K-08 için: 3. sınıf ve üstü (uzatmadakiler dahil); hazırlık ve başlamamış değil. */
export function isUpperClass(standing: ClassStanding): boolean {
  return standing.kind === 'GRADE' && standing.grade >= UPPER_CLASS_MIN_GRADE;
}
