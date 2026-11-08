import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';
import { isRequestLogged, nextLogging } from './dev-logging';

describe('geliştirme günlüğü kişisel veri ve jeton yazmaz (tur #12)', () => {
  it('next.config sunucu eylemi argümanlarını kapatır ve istek süzgecini kullanır', () => {
    expect(nextConfig.logging).toEqual(nextLogging);
    expect(nextLogging.serverFunctions).toBe(false);
  });

  it.each([
    '/api/auth/magic-link/verify?token=abc&callbackURL=%2F',
    '/api/auth/verify-email?token=abc&callbackURL=%2Fhesap%2Fe-posta%3Fadim%3Dtamamlandi',
    '/api/auth/callback/linkedin?code=x&state=y',
    '/giris?token=abc',
    '/api/graduation-documents/01a1/file',
  ])('yazılmaz: %s', (url) => {
    expect(isRequestLogged(url)).toBe(false);
  });

  it.each(['/hesap', '/onay', '/giris?donus=%2Fhesap', '/hesap/e-posta?adim=tamamlandi'])(
    'yazılır (yol + süre, kişisel veri yok): %s',
    (url) => {
      expect(isRequestLogged(url)).toBe(true);
    },
  );
});
