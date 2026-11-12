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
    ['LinkedIn: kisisel-hesap', '[BAĞLANTI]'],
    ['GitHub kullanıcı adı: ornek123', '[BAĞLANTI]'],
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
    expect(redactCvText('ISIK ve IŞIK', 'Işık')).toBe('[AD] ve [AD]');
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

describe('R2 bağımsız kaçırma örnekleri', () => {
  it('email-bracket-at', () => {
    expect(redactCvText('selin [at] ogr.example.edu.tr', 'İpek Işık')).toContain('[E-POSTA]');
  });
  it('email-bracket-dot', () => {
    expect(redactCvText('selin [at] ogr [dot] example [dot] edu [dot] tr', 'İpek Işık')).toContain(
      '[E-POSTA]',
    );
  });
  it('email-spaced', () => {
    expect(redactCvText('selin . yilmaz @ ogr . example . edu . tr', 'İpek Işık')).toContain(
      '[E-POSTA]',
    );
  });
  it('email-newline-at', () => {
    expect(redactCvText('selin.yilmaz@\nogr.example.edu.tr', 'İpek Işık')).toContain('[E-POSTA]');
  });
  it('email-newline-domain', () => {
    expect(redactCvText('selin.yilmaz@ogr.\nexample.edu.tr', 'İpek Işık')).toContain('[E-POSTA]');
  });
  it('email-parenthesized', () => {
    expect(redactCvText('selin(at)example(dot)org', 'İpek Işık')).toContain('[E-POSTA]');
  });
  it('email-fullwidth', () => {
    expect(redactCvText('selin＠example.org', 'İpek Işık')).toContain('[E-POSTA]');
  });
  it('email-label', () => {
    expect(redactCvText('E-posta: selin @ example.org', 'İpek Işık')).toContain('[E-POSTA]');
  });
  it('phone-plus90', () => {
    expect(redactCvText('+90 532 123 45 67', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('phone-0090', () => {
    expect(redactCvText('0090 (532) 123-45-67', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('phone-parentheses', () => {
    expect(redactCvText('(0532)1234567', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('phone-ten-digits', () => {
    expect(redactCvText('5321234567', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('phone-newline', () => {
    expect(redactCvText('+90 532\n123 45 67', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('phone-two', () => {
    expect(redactCvText('0532 123 45 67 / 0542 123 45 67', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('phone-international', () => {
    expect(redactCvText('+49 151 23456789', 'İpek Işık')).toContain('[TELEFON]');
  });
  it('tc-dot', () => {
    expect(redactCvText('100.000.001.46', 'İpek Işık')).toContain('[KİMLİK]');
  });
  it('tc-dash', () => {
    expect(redactCvText('100-000-001-46', 'İpek Işık')).toContain('[KİMLİK]');
  });
  it('tc-slash', () => {
    expect(redactCvText('100/000/001/46', 'İpek Işık')).toContain('[KİMLİK]');
  });
  it('tc-nbsp', () => {
    expect(redactCvText('100 000 001 46', 'İpek Işık')).toContain('[KİMLİK]');
  });
  it('tc-newline', () => {
    expect(redactCvText('100000\n00146', 'İpek Işık')).toContain('[KİMLİK]');
  });
  it('iban-nbsp', () => {
    expect(redactCvText('TR33 0006 1005 1978 6457 8413 26', 'İpek Işık')).toContain('[IBAN]');
  });
  it('iban-newline', () => {
    expect(redactCvText('TR33 0006 1005\n1978 6457 8413 26', 'İpek Işık')).toContain('[IBAN]');
  });
  it('short-url', () => {
    expect(redactCvText('https://bit.ly/3Abcd', 'İpek Işık')).toContain('[BAĞLANTI]');
  });
  it('github-label', () => {
    expect(redactCvText('github: kisisel-hesap', 'İpek Işık')).toContain('[BAĞLANTI]');
  });
  it('github-bare-domain', () => {
    expect(redactCvText('github.com/kisisel-hesap', 'İpek Işık')).toContain('[BAĞLANTI]');
  });
  it('owner-uppercase', () => {
    expect(redactCvText('İPEK IŞIK', 'İpek Işık')).toContain('[AD]');
  });
  it('owner-title', () => {
    expect(redactCvText('Sayın İpek Işık', 'İpek Işık')).toContain('[AD]');
  });
  it('owner-reverse', () => {
    expect(redactCvText('IŞIK, İPEK', 'İpek Işık')).toContain('[AD]');
  });
  it('owner-newline', () => {
    expect(redactCvText('İpek\nIşık', 'İpek Işık')).toContain('[AD]');
  });
  it('owner-dot-separated', () => {
    expect(redactCvText('İ.p.e.k I.ş.ı.k', 'İpek Işık')).toContain('[AD]');
  });
  it('owner-ascii-caps', () => {
    expect(redactCvText('IPEK ISIK', 'İpek Işık')).toContain('[AD]');
  });
  it('owner-unicode', () => {
    expect(redactCvText('İpek I​şık', 'İpek Işık')).toContain('[AD]');
  });
  it('preserve-school', () => {
    expect(redactCvText('İstanbul Üniversitesi', 'İpek Işık')).toBe('İstanbul Üniversitesi');
  });
  it('preserve-company', () => {
    expect(redactCvText('Örnek Teknoloji AŞ', 'İpek Işık')).toBe('Örnek Teknoloji AŞ');
  });
  it('preserve-position', () => {
    expect(redactCvText('Kıdemli Veri Analisti', 'İpek Işık')).toBe('Kıdemli Veri Analisti');
  });
  it('preserve-skill', () => {
    expect(redactCvText('SQL / Node.js / C++ / C#', 'İpek Işık')).toBe('SQL / Node.js / C++ / C#');
  });
  it('preserve-years', () => {
    expect(redactCvText('2019–2023 / 2024', 'İpek Işık')).toBe('2019–2023 / 2024');
  });
  it('preserve-multiple-years', () => {
    expect(redactCvText('2019 2020 2021 2022', 'İpek Işık')).toBe('2019 2020 2021 2022');
  });
});

it('telefonun ardından gelen kimlik satırını geçersiz sayısal adayın içinde tüketmez', () => {
  expect(redactCvText('+90 532\n123 45 67\n100.000.001.46\nSQL', 'İpek Işık')).toBe(
    '[TELEFON]\n[KİMLİK]\nSQL',
  );
});

it('tam telefonun ardından ayrı satırdaki eğitim yılı korunur', () => {
  expect(redactCvText('+1 (212) 555-0123\n2023\nSQL', 'İpek Işık')).toBe('[TELEFON]\n2023\nSQL');
});

describe('bağlamlı ek kişisel veri kalıpları', () => {
  it.each([
    'Doğum: 15 Mart 1999',
    'D.T.: 15 Mart 1999',
    'Date of birth: 15 March 1999',
    'DOB: 15 March 1999',
  ])('ay adlı doğum tarihini gizler: %s', (input) => {
    expect(redactCvText(input, 'İpek Işık')).toBe('[DOĞUM TARİHİ]');
  });

  it.each([
    ['Referans: Prof. Dr. Ahmet Yılmaz', 'Ahmet Yılmaz'],
    ['Referanslar: Mehmet Kaya — Satış Müdürü', 'Mehmet Kaya'],
    ['Referanslar\nAd Soyad: Mehmet Kaya\n\nBeceriler\nSQL', 'Mehmet Kaya'],
    ['Referanslar\nE-posta: kisi@example.com\nAd Soyad: Mehmet Kaya', 'Mehmet Kaya'],
    [
      'References\nProf. Dr. Ahmet Yılmaz\nMehmet Kaya — Satış Müdürü\n\nBeceriler\nSQL',
      'Ahmet Yılmaz',
    ],
    ['Yönetici: Mehmet Kaya', 'Mehmet Kaya'],
    ['Danışman: Ayşe Demir', 'Ayşe Demir'],
    ['Supervisor: John Smith', 'John Smith'],
    ['İletişim kişisi: Deniz Arslan', 'Deniz Arslan'],
    ['İLETİŞİM KİŞİSİ: Deniz Arslan', 'Deniz Arslan'],
  ])('yalnız ilgili bağlamda üçüncü kişiyi gizler: %s', (input, name) => {
    const result = redactCvText(input, 'İpek Işık');
    expect(result).not.toContain(name);
    expect(result).toContain('[KİŞİ]');
    if (input.includes('Mehmet Kaya')) expect(result).not.toContain('Mehmet Kaya');
  });

  it('referans bloğundaki iletişimi gizler ve sonraki bölümü korur', () => {
    const result = redactCvText(
      'Referanslar\nAhmet Yılmaz — Satış Müdürü\nahmet@example.com / 0532 123 45 67\nBeceriler\nVeri Analisti',
      'İpek Işık',
    );
    expect(result).toContain('[KİŞİ]');
    expect(result).toContain('[E-POSTA]');
    expect(result).toContain('[TELEFON]');
    expect(result).toContain('Beceriler\nVeri Analisti');
    expect(result).not.toContain('Ahmet Yılmaz');
  });

  it.each(['ipek-isik.dev', 'isik.me', 'IPEKISIK.com', 'www.ipek-isik.dev'])(
    'sahibin alan adını gizler: %s',
    (domain) => {
      expect(redactCvText(domain, 'İpek Işık')).not.toMatch(/ipek|isik/iu);
      expect(redactCvText(domain, 'İpek Işık')).toMatch(/\[(?:URL|BAĞLANTI)\]/u);
    },
  );

  it.each([
    'Mart 2023 – Haziran 2024',
    'trendyol.com',
    'Referans numarası: 12345',
    'Ahmet Yılmaz ile çalıştım.',
    'Deneyim: Satış Müdürü',
  ])('bağlam dışı içeriği korur: %s', (input) => {
    expect(redactCvText(input, 'İpek Işık')).toBe(input);
  });
});
