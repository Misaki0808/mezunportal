import { describe, expect, it } from 'vitest';

import { findIdentityLeak, foldTr, hasPersonalDataPattern, nameTokens } from './faq';

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
    ['Ahmetçe değil, ahmetlik', true], // "ahmetlik" ek almış biçim
    ['Başvuru için kayalık bir yol', true], // katı: 4+ harfli ad önek eşleşmesi (yanlış alarm moderatörce düzeltilir)
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
