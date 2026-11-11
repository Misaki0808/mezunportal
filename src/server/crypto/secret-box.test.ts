import { describe, expect, it } from 'vitest';

import { SecretBoxError, decryptSecret, encryptSecret } from './secret-box';

const SECRET = 'test-sunucu-sirri-en-az-otuz-iki-karakter-uzunlugunda';
const OTHER = 'baska-bir-sunucu-sirri-en-az-otuz-iki-karakter-x';
const TOKEN = '1//0gFAKE-yenileme-jetonu_ABC123';

describe('sır kutusu (AES-256-GCM)', () => {
  it('şifrelenen değer geri çözülür; saklanan metin düz metni içermez', () => {
    const stored = encryptSecret(TOKEN, SECRET, 'GOOGLE_CALENDAR');
    expect(stored).not.toContain(TOKEN);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(decryptSecret(stored, SECRET, 'GOOGLE_CALENDAR')).toBe(TOKEN);
  });

  it('her şifreleme yeni IV kullanır: aynı değer iki farklı şifreli metin verir', () => {
    expect(encryptSecret(TOKEN, SECRET, 'x')).not.toBe(encryptSecret(TOKEN, SECRET, 'x'));
  });

  it('yanlış sır, yanlış bağlam ya da bozulmuş veri çözülmez ve hata değer içermez', () => {
    const stored = encryptSecret(TOKEN, SECRET, 'GOOGLE_CALENDAR');
    const [version, iv, tag, body] = stored.split('.');
    const flipped = `${body!.slice(0, -2)}${body!.endsWith('AA') ? 'BB' : 'AA'}`;
    const cases: [string, string, string][] = [
      [stored, OTHER, 'GOOGLE_CALENDAR'],
      [stored, SECRET, 'BASKA_ALAN'],
      [`${version}.${iv}.${tag}.${flipped}`, SECRET, 'GOOGLE_CALENDAR'],
      [`${version}.${iv}.${'A'.repeat(22)}.${body}`, SECRET, 'GOOGLE_CALENDAR'],
      ['v2.a.b.c', SECRET, 'GOOGLE_CALENDAR'],
      ['düz metin', SECRET, 'GOOGLE_CALENDAR'],
      ['', SECRET, 'GOOGLE_CALENDAR'],
    ];
    for (const [value, secret, context] of cases) {
      let thrown: unknown;
      try {
        decryptSecret(value, secret, context);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, value).toBeInstanceOf(SecretBoxError);
      expect(String((thrown as Error).message)).not.toContain(TOKEN);
      expect(String((thrown as Error).message)).toBe('SECRET_BOX_UNREADABLE');
    }
  });

  it('kısa sunucu sırrı reddedilir (zayıf anahtar türetilmez)', () => {
    expect(() => encryptSecret(TOKEN, 'kisa', 'x')).toThrow(SecretBoxError);
  });
});
