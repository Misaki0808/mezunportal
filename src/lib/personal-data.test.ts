import { describe, expect, it } from 'vitest';
import {
  hasPersonalDataInValues,
  hasPersonalDataPattern,
  isIdentifierField,
  isIdentifierKey,
  looksLikePersonalData,
} from './personal-data';
import { updateProfileBasicsSchema } from '@/contracts/profile-content';

describe('SSS ve profil aynı kişisel veri biçimi denetimini kullanır', () => {
  it.each([
    'ornek@example.org',
    'İletişim: ornek+staj@example.org.',
    '05321234567',
    '+90 532 123 45 67',
    '90-532-123-45-67',
    '(532) 123 45 67',
    '532.123.45.67',
    '12345678901',
  ])('biçim reddedilir: %s', (value) => {
    expect(hasPersonalDataPattern(value)).toBe(true);
    for (const field of ['headline', 'summary', 'city', 'goals']) {
      const parsed = updateProfileBasicsSchema.safeParse({ [field]: value });
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(parsed.error.issues).toContainEqual(
          expect.objectContaining({ path: [field], message: 'PROFILE_TEXT_PERSONAL_DATA' }),
        );
    }
  });
  it.each([
    '2026 yılında 3 proje ve 1200 satır SQL',
    'Not ortalamam 3.45',
    'https://example.org/projeler/2026',
    'C++ ve C#',
    'İstanbul',
    '',
    'ornek at example nokta org',
    'ornek [at] example [dot] org',
  ])('SSS ile mevcut sınır aynı kalır: %s', (value) => {
    expect(hasPersonalDataPattern(value)).toBe(false);
    expect(updateProfileBasicsSchema.safeParse({ summary: value }).success).toBe(true);
  });
  it('audit aynı işlevi kullanır; regex kopyası yoktur', () => {
    expect(hasPersonalDataPattern).toBe(looksLikePersonalData);
  });
});

// Kart 435: sunucunun eklediği sözlük kimlikleri kullanıcı metni sanılmaz; serbest metin yine taranır.
describe('kimlik alanları kişisel veri sanılmaz, serbest metin taranır', () => {
  const COMPANY_ID = '019aa000-0000-7000-8000-005551234567';
  const SEED_ID = 'ed2925f1bf00d68392766449';

  it('kimlik değerleri telefon biçimine benzeyebilir: bu yanlış pozitifin kendisi (test boş değil)', () => {
    expect(looksLikePersonalData(COMPANY_ID)).toBe(true);
  });

  it.each([
    ['id', COMPANY_ID],
    ['ids', COMPANY_ID],
    ['companyId', COMPANY_ID],
    ['titleId', COMPANY_ID.toUpperCase()],
    ['skillId', SEED_ID],
    ['source_id', COMPANY_ID],
    ['user_ids', SEED_ID],
  ])('%s alanında tam kimlik muaf: %s', (key, value) => {
    expect(isIdentifierField(key, value)).toBe(true);
  });

  it.each([
    ['companyId', '05321234567'],
    ['companyId', '+90 532 123 45 67'],
    ['companyId', 'ayse@example.invalid'],
    ['companyId', '12345678901'],
    ['companyId', `önek ${COMPANY_ID}`],
    ['companyId', `${COMPANY_ID} 05321234567`],
    ['companyId', `{${COMPANY_ID}}`],
    ['companyId', ` ${COMPANY_ID} `],
    ['description', COMPANY_ID],
    ['company', COMPANY_ID],
    ['userEmailId', 'ayse@example.invalid'],
  ])('%s alanında %s muaf değil', (key, value) => {
    expect(isIdentifierField(key, value)).toBe(false);
  });

  it('kimlik anahtarı adları', () => {
    for (const key of ['id', 'ids', 'companyId', 'titleIds', 'a_id', 'a_ids'])
      expect(isIdentifierKey(key)).toBe(true);
    for (const key of ['name', 'company', 'idea', 'identifier', 'Id ', 'paid'])
      expect(isIdentifierKey(key)).toBe(false);
  });

  it('nesne taraması: sözlük kimlikleri geçer, serbest metindeki telefon/e-posta/kimlik numarası yakalanır', () => {
    const position = { company: 'Örnek A.Ş.', title: 'Stajyer', description: 'Güzel bir staj.' };
    expect(
      hasPersonalDataInValues({
        ...position,
        companyId: COMPANY_ID,
        titleId: COMPANY_ID,
        sectorId: null,
      }),
    ).toBe(false);
    expect(hasPersonalDataInValues({ name: 'SQL', skillId: COMPANY_ID })).toBe(false);
    for (const text of ['Beni ara 0532 123 45 67', 'ayse@example.invalid', '12345678901'])
      expect(
        hasPersonalDataInValues({ ...position, description: text, companyId: COMPANY_ID }),
      ).toBe(true);
    // Kimlik anahtarına gizlenen kişisel veri muaf değildir (değer UUID değil).
    expect(hasPersonalDataInValues({ ...position, companyId: '05321234567' })).toBe(true);
    // Kimlik DEĞERİ kimlik olmayan alanda serbest metin sayılır.
    expect(hasPersonalDataInValues({ ...position, description: COMPANY_ID })).toBe(true);
    // Dize olmayan değerler taranmaz (eski davranış).
    expect(hasPersonalDataInValues({ count: 5321234567, ok: true, none: null })).toBe(false);
  });
});
