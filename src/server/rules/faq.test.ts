import { describe, expect, it } from 'vitest';

import {
  analyzeIdentity,
  BLOCKING_NAME_SUFFIXES,
  findIdentityLeak,
  foldTr,
  hasPersonalDataPattern,
  nameTokens,
} from './faq';

describe('foldTr', () => {
  it.each([
    ['İSTANBUL', 'istanbul'],
    ['ıspanak', 'ispanak'],
    ['ÇAĞRI Şükrü', 'cagri sukru'],
    ['Âli', 'ali'],
  ])('%s → %s', (input, expected) => expect(foldTr(input)).toBe(expected));
});

describe('nameTokens', () => {
  it('ad ve soyadı ayrı sözcüklere böler; 3 harften kısa parçalar atılır; tekrarlar birleşir', () => {
    expect(nameTokens(['Ayşe Nur Yılmaz', 'ayse YILMAZ']).sort()).toEqual(
      ['ayse', 'nur', 'yilmaz'].sort(),
    );
    expect(nameTokens(['Al Bo'])).toEqual([]);
  });
});

describe('findIdentityLeak', () => {
  const names = ['Ahmet Yılmaz', 'Zeynep Kaya'];
  it.each([
    ['Ahmet bana şunu söyledi', true],
    ['ahmet', true],
    ["Ahmet'e sordum", true],
    ['Ahmete sordum', true],
    ['AHMET YILMAZ mentörüm', true],
    ['yilmaz hoca', true],
    ['Zeynep Hanım önermişti', true],
    ['Kaya teşekkürler', true],
    ['Staj başvurusunda neleri hazırlamalıyım', false],
    ['Ahmetçe değil, ahmetlik', false], // yalnız ad ÖNEKİ: engel değil, uyarı (aşağıda)
    ['Başvuru için kayalık bir yol', false], // aynı: uyarı
    ['Kayıt işlemleri nasıl yapılır', false],
  ])('%s → %s', (text, leak) => {
    expect(findIdentityLeak(text, names)).toBe(leak);
  });
  it('e-posta, telefon ve kimlik numarası biçimi adsız da sızıntıdır', () => {
    expect(findIdentityLeak('bana ornek@okul.edu.tr yaz', [])).toBe(true);
    expect(findIdentityLeak('0532 123 45 67 numarasından ara', [])).toBe(true);
    expect(findIdentityLeak('kimlik 12345678901', [])).toBe(true);
    expect(findIdentityLeak('CV için hangi sertifikalar işe yarar', [])).toBe(false);
  });
  it('görünmez karakter, birleşik aksan ve kullanıcı kimliğiyle saklama girişimini yakalar', () => {
    expect(findIdentityLeak('Bu\u200brak önerdi', ['Burak Soylu'])).toBe(true);
    expect(findIdentityLeak('Bu-rak önerdi', ['Burak Soylu'])).toBe(true);
    expect(findIdentityLeak('Bu rak önerdi', ['Burak Soylu'])).toBe(true);
    expect(findIdentityLeak('B u r a k önerdi', ['Burak Soylu'])).toBe(true);
    expect(findIdentityLeak('Moderato\u0308r dedi', ['Moderatör Hoca'])).toBe(true);
    expect(findIdentityLeak('ilgili: abc123-4def', [], ['abc123-4def'])).toBe(true);
    expect(findIdentityLeak('staj başvurusu', ['Burak Soylu'], ['abc123-4def'])).toBe(false);
  });
  it('kısa (3 harf) ad yalnız tam eşleşmeyle yakalanır', () => {
    expect(findIdentityLeak('Ali ile konuştum', ['Ali Veli'])).toBe(true);
    expect(findIdentityLeak('alım satım işlemleri', ['Ali Veli'])).toBe(false);
  });
});

describe('hasPersonalDataPattern', () => {
  it('yalnız biçimi denetler', () => {
    expect(hasPersonalDataPattern('a@b.co')).toBe(true);
    expect(hasPersonalDataPattern('Ahmet')).toBe(false);
  });
});

describe('analyzeIdentity: engel ve uyarı (kart 122)', () => {
  const names = ['Deniz Aksoy', 'Sistem Yöneticisi'];

  it.each([
    ['Deniz', 'tam sözcük'],
    ["Deniz'in tavsiyesi", 'kesmeli tamlayan'],
    ["Deniz'e sordum", 'kesmeli yönelme'],
    ['Denizin tavsiyesi', 'kesmesiz tamlayan'],
    ['Denize sordum', 'kesmesiz yönelme'],
    ['denizden duydum', 'çıkma'],
    ['denizle konuştum', 'vasıta'],
    ['denizler', 'çoğul'],
    ['DENİZ hoca', 'büyük harf + noktalı İ'],
    ["DENİZ'İN", 'büyük harf kesmeli'],
    ['deniz\u200b in', 'görünmez karakter'],
    ['D e n i z yazdı', 'harfleri bölünmüş'],
    ['D-e-n-i-z yazdı', 'noktalamayla bölünmüş'],
    ['D e n i z c i l i k', 'harfleri bölünmüş (sonrası ayrı harfler)'],
    ['Aksoy hocaya sor', 'soyad'],
    ['aksoyun görüşü', 'soyad + tamlayan'],
  ])('ENGEL: %s (%s)', (text) => {
    const found = analyzeIdentity(text, names);
    expect(found.blocked).toBe(true);
    expect(findIdentityLeak(text, names)).toBe(true);
  });

  it.each([
    ['denizcilik sektörü', ['denizcilik']],
    ['Denizli şehrinde staj', ['Denizli']],
    ['sistematik yaklaşım', ['sistematik']],
    ['Aksoyluk yok', ['Aksoyluk']],
    ['denizcilik ve denizaltı', ['denizcilik', 'denizaltı']],
  ])('UYARI (engel değil): %s', (text, expected) => {
    const found = analyzeIdentity(text, names);
    expect(found.blocked).toBe(false);
    expect(found.warnings).toEqual(expected);
    expect(findIdentityLeak(text, names)).toBe(false);
  });

  it('ilgisiz metin: engel de uyarı da yok', () => {
    expect(analyzeIdentity('Staj başvurusunda neleri hazırlamalıyım', names)).toEqual({
      blocked: false,
      warnings: [],
    });
  });

  it('engel uyarıdan önceliklidir (aynı metinde ikisi de varsa uyarı listesi boş)', () => {
    expect(analyzeIdentity('denizcilik için Deniz önerdi', names)).toEqual({
      blocked: true,
      warnings: [],
    });
  });

  it('Türkçe İ/ı katlaması: IŞIK ve ışık ile İSMAİL/ismail aynı sayılır', () => {
    expect(findIdentityLeak('IŞIK hoca', ['Işık Demir'])).toBe(true);
    expect(findIdentityLeak("İsmail'in görüşü", ['ISMAIL Kaya'])).toBe(true);
    expect(analyzeIdentity('ISIKLI ortam', ['Işık Demir']).warnings).toEqual(['ISIKLI']);
  });

  it('uyarı sözcüğü özgün yazımla gösterilir; en çok 5 sözcük, her biri en çok 40 karakter', () => {
    const many = analyzeIdentity(
      'denizcilik denizlik denizlikçi denizaltı denizlikler denizyolu denizci',
      names,
    );
    expect(many.blocked).toBe(false);
    expect(many.warnings.length).toBeLessThanOrEqual(5);
    const long = analyzeIdentity(`deniz${'x'.repeat(60)}`, names);
    expect(long.warnings[0]!.length).toBeLessThanOrEqual(41);
  });

  it('3 harfli ad yalnız tam eşleşmeyle engel; ek ve önek yok sayılır', () => {
    expect(analyzeIdentity('Alim ve aliye', ['Ali Veli']).blocked).toBe(false);
    expect(analyzeIdentity('Ali ile', ['Ali Veli']).blocked).toBe(true);
  });

  it('kimlik ve kişisel veri biçimi her zaman engeldir; ek tablosu katlanmış biçimdedir', () => {
    expect(analyzeIdentity('ornek@okul.edu.tr', []).blocked).toBe(true);
    expect(analyzeIdentity('kod abc123', [], ['abc123']).blocked).toBe(true);
    for (const suffix of BLOCKING_NAME_SUFFIXES) expect(foldTr(suffix)).toBe(suffix);
  });
});
