import { describe, expect, it } from 'vitest';
import { isTurkishIdentityNumber, redactCvText } from './redactCvText';

describe('CV kişisel veri maskeleme', () => {
  it.each([
    ['ayse@example.com', '[E-POSTA]'],
    ['AYSE.OZ+cv@EXAMPLE.COM', '[E-POSTA]'],
    ['şule@örnek.istanbul', '[E-POSTA]'],
    ['0532 123 45 67', '[TELEFON]'],
    ['(0532) 123-45-67', '[TELEFON]'],
    ['5321234567', '[TELEFON]'],
    ['0212 555 44 33', '[TELEFON]'],
    ['+90 (532) 123 45 67', '[TELEFON]'],
    ['+1 (212) 555-0123', '[TELEFON]'],
    ['1 (212) 555-0123', '[TELEFON]'],
    ['0044 20 7946 0958', '[TELEFON]'],
    ['https://linkedin.com/in/example', '[BAĞLANTI]'],
    ['http://example.org/cv', '[BAĞLANTI]'],
    ['www.example.org', '[BAĞLANTI]'],
    ['linkedin.com/in/example', '[BAĞLANTI]'],
    ['github.com/example', '[BAĞLANTI]'],
    ['portfolio.example.com/example', '[BAĞLANTI]'],
    ['@kullanici_adi', '[BAĞLANTI]'],
    ['10000000146', '[KİMLİK]'],
    ['100 000 001 46', '[KİMLİK]'],
    ['TR33 0006 1005 1978 6457 8413 26', '[IBAN]'],
    ['GB82 WEST 1234 5698 7654 32', '[IBAN]'],
    ['NO93 8601 1117 947', '[IBAN]'],
    ['Doğum tarihi: 01.02.1998', '[DOĞUM TARİHİ]'],
    ['Date of birth: 1998-02-01', '[DOĞUM TARİHİ]'],
    ['DOB: 01/02/1998', '[DOĞUM TARİHİ]'],
    ['Date of birth: February 3, 1998', '[DOĞUM TARİHİ]'],
    ['01-02-1998', '[DOĞUM TARİHİ]'],
    ['Adres: Örnek Mah. No: 3', '[ADRES]'],
    ['Örnek Mah. Örnek Cad. No: 3', '[ADRES]'],
    ['Örnek Sok. No: 12', '[ADRES]'],
    ['Örnek Mahallesi Örnek Caddesi 3', '[ADRES]'],
    ['Posta kodu: 34000', '[ADRES]'],
  ])('%s → %s', (input, expected) => {
    expect(redactCvText(input, 'Zehra Yılmaz')).toBe(expected);
  });
  it.each([
    '2023',
    'İstanbul Üniversitesi',
    'SQL',
    'Microsoft',
    'Veri Analisti',
    'Marmara Üniversitesi',
    'TypeScript',
    'Node.js',
    'Deneyim: 2020-2023',
    '10000000147',
    'İSTANBUL',
    'AŞ',
    'Yönetim Bilişim Sistemleri',
  ])('kişisel olmayan içeriği korur: %s', (input) => {
    expect(redactCvText(input, 'Zehra Yılmaz')).toBe(input);
  });
  it('yükleyenin adını Türkçe İ/ı dahil her bağımsız geçişte maskeler', () => {
    expect(redactCvText('İPEK IŞIK / ipek ışık / İpek Işık, İpekyolu', 'İpek Işık')).toBe(
      '[AD] [AD] / [AD] [AD] / [AD] [AD], İpekyolu',
    );
    expect(redactCvText('ISIK ve IŞIK', 'Işık')).toBe('ISIK ve [AD]');
    expect(redactCvText('i\u0307pek I\u200bŞIK', 'İpek Işık')).toBe('[AD] [AD]');
  });
  it('kimlik algoritmasını uygular ve boş sunucu adında kapalı kalır', () => {
    expect(isTurkishIdentityNumber('10000000146')).toBe(true);
    expect(isTurkishIdentityNumber('10000000147')).toBe(false);
    expect(() => redactCvText('SQL', '  ')).toThrow('CV_OWNER_NAME_REQUIRED');
    expect(() => redactCvText('SQL', Array(21).fill('Ali').join(' '))).toThrow(
      'CV_OWNER_NAME_REQUIRED',
    );
    expect(() => redactCvText('x'.repeat(200_001), 'Ali')).toThrow('CV_REDACTION_LIMIT');
  });
});
