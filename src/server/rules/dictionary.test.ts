import { describe, expect, it } from 'vitest';

import { normalizeName } from './dictionary';

describe('normalizeName', () => {
  it.each([
    ['İstanbul Üniversitesi', 'istanbul universitesi'],
    ['IŞIK ÇAĞRI', 'isik cagri'],
    ['  Yazılım   Mühendisi ', 'yazilim muhendisi'],
    ['Node.js', 'nodejs'],
    ['C++', 'c++'],
    ['C#', 'c#'],
    ['Kadın & Genç', 'kadin ve genc'],
    ['Café', 'cafe'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('görünmez karakterler adı değiştirmez', () => {
    expect(normalizeName('Ya​zılım‮')).toBe(normalizeName('Yazılım'));
  });

  it.each([
    ['Aselsan A.Ş.', 'aselsan'],
    ['ASELSAN A. Ş.', 'aselsan'],
    ['Acme Teknoloji Ltd. Şti.', 'acme teknoloji'],
    ['Acme Inc.', 'acme'],
    ['Acme GmbH', 'acme'],
    ['Acme Anonim Şirketi', 'acme'],
  ])('şirket hukuki eki düşer: %s → %s', (input, expected) => {
    expect(normalizeName(input, 'COMPANY')).toBe(expected);
  });

  it('hukuki ek yalnız şirkette düşer; unvan ve becerilerde kalır', () => {
    expect(normalizeName('Sales Co', 'TITLE')).toBe('sales co');
    expect(normalizeName('Aselsan A.Ş.')).toBe('aselsan as');
  });

  it('tek sözcüklü ad hukuki ek sayılıp boşaltılmaz', () => {
    expect(normalizeName('A.Ş.', 'COMPANY')).toBe('as');
    expect(normalizeName('Co', 'COMPANY')).toBe('co');
  });

  it('çıktı sınırlıdır ve boş girdi boş döner', () => {
    expect(normalizeName('a'.repeat(500))).toHaveLength(200);
    expect(normalizeName('   ')).toBe('');
  });

  it('rastgele metinde çökmez, idempotenttir ve yalnız küçük ASCII, rakam, + # ve boşluk üretir', () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const alphabet =
      'abcçdefgğhıijklmnoöprsştuüvyzABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789 .&-_()/éÉ​';
    for (let i = 0; i < 300; i += 1) {
      const text = Array.from(
        { length: 1 + (next() % 40) },
        () => alphabet[next() % alphabet.length],
      ).join('');
      const once = normalizeName(text, 'COMPANY');
      expect(once).toMatch(/^[a-z0-9+# ]*$/);
      expect(normalizeName(once, 'COMPANY')).toBe(once);
    }
  });
});
