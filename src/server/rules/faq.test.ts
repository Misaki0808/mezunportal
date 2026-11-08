import { describe, expect, it } from 'vitest';

import {
  analyzeIdentity,
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
    ['Ahmete sordum', false], // kesmesiz ekli biçim: uyarı (cins isim olabilir)
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
    ['DENİZ hoca', 'büyük harf + noktalı İ'],
    ["DENİZ'İN", 'büyük harf kesmeli'],
    ['deniz\u200b in', 'görünmez karakter'],
    ['D e n i z yazdı', 'harfleri bölünmüş'],
    ['D-e-n-i-z yazdı', 'noktalamayla bölünmüş'],
    ['D e n i z c i l i k', 'harfleri bölünmüş (sonrası ayrı harfler)'],
    ['Aksoy hocaya sor', 'soyad'],
  ])('ENGEL: %s (%s)', (text) => {
    const found = analyzeIdentity(text, names);
    expect(found.blocked).toBe(true);
    expect(findIdentityLeak(text, names)).toBe(true);
  });

  it.each([
    ['denizcilik sektörü', ['denizcilik']],
    ['Denizin tavsiyesi', ['Denizin']], // kesmesiz ekli biçimler (cins isim olabilir)
    ['Denize sordum', ['Denize']],
    ['denizden duydum', ['denizden']],
    ['denizle konuştum', ['denizle']],
    ['sisteme girdim', ['sisteme']],
    ['aksoyun görüşü', ['aksoyun']],
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

  it('noktalamayla bölünmüş ad başka sözcüğe uzanıyorsa UYARI, tek başına ya da ekli ise ENGEL', () => {
    expect(analyzeIdentity('D.enizcilik alanı', names)).toMatchObject({ blocked: false });
    expect(analyzeIdentity('D.enizcilik alanı', names).warnings.length).toBeGreaterThan(0);
    expect(analyzeIdentity('De nizcilik alanı', names)).toEqual({
      blocked: false,
      warnings: ['de nizcilik'],
    });
    expect(analyzeIdentity('D.eniz alanı', names).blocked).toBe(true);
    expect(analyzeIdentity('D.eniz in alanı', names).blocked).toBe(true);
  });

  it('aynı uyarı sözcüğü bir kez listelenir', () => {
    expect(analyzeIdentity('denizcilik denizcilik denizcilik', names).warnings).toEqual([
      'denizcilik',
    ]);
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
    expect(analyzeIdentity('Alim ve aliye', ['Ali Veli'])).toEqual({
      blocked: false,
      warnings: [],
    });
    expect(analyzeIdentity('Ali ile', ['Ali Veli']).blocked).toBe(true);
  });

  it('kimlik ve kişisel veri biçimi her zaman engeldir', () => {
    expect(analyzeIdentity('ornek@okul.edu.tr', []).blocked).toBe(true);
    expect(analyzeIdentity('kod abc123', [], ['abc123']).blocked).toBe(true);
  });

  it('Türkçe yazım kuralı: kesmeli ekli biçim ENGEL, aynı ek kesmesiz UYARI (her ek türü)', () => {
    for (const suffix of ['in', 'ın', 'e', 'a', 'i', 'de', 'den', 'le', 'ler', 'lerin'])
      expect(analyzeIdentity(`Deniz'${suffix} dedi`, names).blocked, `Deniz'${suffix}`).toBe(true);
    for (const suffix of ['in', 'e', 'i', 'de', 'den', 'le', 'ler', 'lerin'])
      expect(analyzeIdentity(`deniz${suffix} dedi`, names), `deniz${suffix}`).toEqual({
        blocked: false,
        warnings: [`deniz${suffix}`],
      });
    expect(analyzeIdentity('DENİZ’İN sözü', names).blocked).toBe(true); // tipografik kesme
  });
});

describe('analyzeIdentity: kesme işareti varyantları ve aksanlar engelde yakalanır (kart 126)', () => {
  const names = ['Deniz Aksoy'];
  // Düz, kıvrık, harf sayılan değiştirici harf (Lm), simge ve tam genişlik biçimleri: hepsi KESMELİ ek = ENGEL.
  it.each([
    ["'", 'düz'],
    ['\u2019', 'kıvrık ’'],
    ['\u2018', 'ters kıvrık ‘'],
    ['\u02BC', 'değiştirici harf ʼ (Lm)'],
    ['\u02BB', 'değiştirici harf ʻ (Lm)'],
    ['\u02B9', 'değiştirici harf ʹ (Lm)'],
    ['\u02C8', 'dikey çizgi ˈ (Lm)'],
    ['`', 'grave'],
    ['\u00B4', 'acute ´'],
    ['\u2032', 'asal ′'],
    ['\uFF07', 'tam genişlik ＇'],
  ])('Deniz%sin: %s → engel', (mark) => {
    const result = analyzeIdentity(`Deniz${mark}in cevabı`, names);
    expect(result.blocked).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it.each(['Déniz', 'Dêniz', 'D\u0065\u0301niz', 'Denı\u0307z', 'DÉNİZ', 'Ｄéｎｉｚ'])(
    'aksanlı ya da birleşik işaretli ad %s da yakalanır',
    (variant) => {
      expect(analyzeIdentity(`Bunu ${variant} yazdı`, names).blocked).toBe(true);
    },
  );

  it('kesmesiz ek yine yalnız uyarıdır; ilgisiz aksanlı sözcük etkilenmez', () => {
    expect(analyzeIdentity('denize sor', names)).toEqual({ blocked: false, warnings: ['denize'] });
    expect(analyzeIdentity('çalışma şüphesiz öğretici', names)).toEqual({
      blocked: false,
      warnings: [],
    });
  });

  it('uyarı sözcüğü ayırıcı çevirisi yüzünden bozulmaz (özgün yazım korunur)', () => {
    expect(analyzeIdentity('Şu denizcilik işi', names).warnings).toEqual(['denizcilik']);
  });
});
