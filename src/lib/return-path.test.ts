import { describe, expect, it } from 'vitest';

import { safeReturnPath, withReturnPath } from './return-path';

describe('dönüş yolu (açık yönlendirme yok)', () => {
  it.each([
    ['/hesap', '/hesap'],
    ['/hesap/gizlilik?sekme=1', '/hesap/gizlilik?sekme=1'],
    ['/hesap#parca', '/hesap'],
    ['/iletisim-iste/abc', '/iletisim-iste/abc'],
    ['/profil/%C4%B0stanbul?ara=%2F', '/profil/%C4%B0stanbul?ara=%2F'],
    ['/', '/'],
  ])('site içi yol kabul: %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    '//kotu.example',
    '//kotu.example/hesap',
    '/\\kotu.example',
    '\\\\kotu.example',
    'https://kotu.example',
    'http:/kotu.example',
    'javascript:alert(1)',
    'hesap',
    '',
    '/\tkotu',
    '/hesap\nSet-Cookie: x',
    '/giris',
    '/giris?donus=/hesap',
    '/onay',
    '/cikis',
    '/api/auth/magic-link/verify',
    '/%2f%2fevil.com',
    '/%5cevil.com',
    '/%252f%252fevil.com',
    '/%255cevil.com',
    '/%68%74%74%70%73:%2f%2fevil.com',
    '/%2e%2e/%2f%2fevil.com',
    '/%250d%250aevil',
    '/%256fnay',
    '/' + 'a'.repeat(600),
    42,
    null,
    undefined,
  ])('reddedilir: %j', (input) => {
    expect(safeReturnPath(input)).toBeNull();
  });

  it('girişe/onaya güvenli dönüş parametresi ekler; ana sayfa ya da güvensiz yolda eklemez', () => {
    expect(withReturnPath('/giris', '/hesap?a=b')).toBe('/giris?donus=%2Fhesap%3Fa%3Db');
    expect(withReturnPath('/giris', '/')).toBe('/giris');
    expect(withReturnPath('/giris', '//kotu.example')).toBe('/giris');
    expect(withReturnPath('/onay', null)).toBe('/onay');
  });
});
