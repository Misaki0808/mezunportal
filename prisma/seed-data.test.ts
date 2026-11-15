import { describe, expect, it } from 'vitest';

import { INSTITUTION_SEED } from './seed-data';

// K-06 (kullanıcı kararı, 14 Kas 2026): kurum değerleri kullanıcıca doğrulandı. `seed-institutions.db.test.ts` seed'i kendi
// sabitine karşı sınar; bu dosya sabitin kendisini kullanıcının kararına bağlar: değer değişirse test bilerek güncellenir.
describe('kurum seed değerleri (K-06, kullanıcı kararı)', () => {
  it('öğrenci ve personel e-posta alanları, fakülte ve bölüm kullanıcının doğruladığı değerlerdir', () => {
    expect(INSTITUTION_SEED.university.name).toBe('İstanbul Üniversitesi');
    expect(INSTITUTION_SEED.university.studentEmailDomains).toEqual(['ogr.iu.edu.tr']);
    expect(INSTITUTION_SEED.university.staffEmailDomains).toEqual(['istanbul.edu.tr']);
    expect(INSTITUTION_SEED.faculty.name).toBe('İktisat Fakültesi');
    expect(INSTITUTION_SEED.department).toEqual({
      name: 'Yönetim Bilişim Sistemleri',
      code: 'YBS',
    });
  });

  it('İÜ-Cerrahpaşa ayrı üniversitedir: alan adı seed verisine girmez', () => {
    const domains = [
      ...INSTITUTION_SEED.university.studentEmailDomains,
      ...INSTITUTION_SEED.university.staffEmailDomains,
    ];
    expect(domains.some((domain) => domain.includes('iuc.edu.tr'))).toBe(false);
  });
});
