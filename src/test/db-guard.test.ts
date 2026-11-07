import { describe, expect, it } from 'vitest';

import { resolveTestDatabaseUrl } from './db-guard';

// Veritabanlı testlerin global kurulumu bu adresin şemasını düşürür; koruma burada sınanır.
const HOST = 'postgresql://kullanici:gizli-parola@127.0.0.1:5432';

describe('resolveTestDatabaseUrl', () => {
  it('adı _test ile biten veritabanını kabul eder', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL_TEST: `${HOST}/mezun_ornek_test` })).toBe(
      `${HOST}/mezun_ornek_test`,
    );
  });

  it.each([
    ['tanımsız', undefined],
    ['boş', ''],
  ])('DATABASE_URL_TEST %s ise reddeder (DATABASE_URL kullanılmaz)', (_label, value) => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: `${HOST}/mezun_ornek`, DATABASE_URL_TEST: value }),
    ).toThrow(/tanımlı değil/);
  });

  it.each([
    ['geliştirme veritabanı', `${HOST}/mezun_ornek`],
    ['sorgu parametresiyle _test taklidi', `${HOST}/mezun_ornek?x=_test`],
    ['adın ortasında _test', `${HOST}/mezun_test_ornek`],
    ['veritabanı adı yok', `${HOST}/`],
  ])('%s reddedilir', (_label, url) => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL_TEST: url })).toThrow(/reddedildi/);
  });

  it('geçersiz adresi reddeder ve mesajda adresi taşımaz', () => {
    const error = (() => {
      try {
        resolveTestDatabaseUrl({ DATABASE_URL_TEST: 'gizli-parola_test' });
      } catch (caught) {
        return caught as Error;
      }
      throw new Error('Hata bekleniyordu');
    })();
    expect(error.message).toMatch(/reddedildi/);
    expect(error.message).not.toContain('gizli-parola');
  });
});
