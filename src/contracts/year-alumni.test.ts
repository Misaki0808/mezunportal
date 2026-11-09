import { describe, expect, it } from 'vitest';
import {
  configureAwardCycleSchema,
  selectYearAlumnusSchema,
  setAwardPublicationSchema,
  publicAwardSchema,
} from './year-alumni';

describe('Yılın Mezunu sözleşmesi', () => {
  it('tören tarihini, seçim gerekçesini ve açık yayın kararını doğrular', () => {
    expect(
      configureAwardCycleSchema.safeParse({
        departmentId: 'd',
        year: 2025,
        ceremonyDate: '2026-06-01',
      }).success,
    ).toBe(true);
    expect(
      configureAwardCycleSchema.safeParse({
        departmentId: 'd',
        year: 2025,
        ceremonyDate: '2026-02-30',
      }).success,
    ).toBe(false);
    expect(
      selectYearAlumnusSchema.safeParse({ departmentId: 'd', year: 2025, userId: 'u', reason: '' })
        .success,
    ).toBe(false);
    expect(setAwardPublicationSchema.safeParse({ awardId: 'a', public: 'true' }).success).toBe(
      false,
    );
  });
  it('kamuya açık veri şekli kişisel iletişim alanlarını reddeder', () => {
    const data = {
      name: 'Örnek Mezun',
      award: 'Yılın Mezunu',
      department: 'YBS',
      year: 2025,
      university: 'İstanbul Üniversitesi',
    };
    expect(publicAwardSchema.safeParse(data).success).toBe(true);
    expect(publicAwardSchema.safeParse({ ...data, email: 'test@example.invalid' }).success).toBe(
      false,
    );
  });
});
