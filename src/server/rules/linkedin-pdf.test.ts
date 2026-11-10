import { describe, expect, it } from 'vitest';
import { splitLinkedInSections } from './linkedin-pdf';
describe('LinkedIn bölüm başlıkları', () => {
  it.each([
    [
      'Deneyim\nSentetik Şirket\nEğitim\nÖrnek Okul\nYetenekler\nSQL\nDiller\nTürkçe',
      'Sentetik Şirket',
      'Örnek Okul',
    ],
    [
      'EXPERIENCE\nSample Company\nEDUCATION\nSample School\nSKILLS\nSQL\nLanguages\nEnglish',
      'Sample Company',
      'Sample School',
    ],
  ])('TR ve EN metnini bölümlere ayırır', (text, company, school) => {
    expect(splitLinkedInSections(text)).toEqual({
      experience: [company],
      education: [school],
      skills: ['SQL'],
    });
  });
  it('başlık dışı metni atlar ve başlığın alt kümesini eşleştirmez', () => {
    expect(
      splitLinkedInSections('Ad Soyad\nDeneyim özeti\nKişisel veri\nExperience:\nEngineer'),
    ).toEqual({ experience: ['Engineer'], education: [], skills: [] });
  });
});
