import { describe, expect, it } from 'vitest';
import { hasPersonalDataPattern, looksLikePersonalData } from './personal-data';
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
