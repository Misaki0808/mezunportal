import { describe, expect, it } from 'vitest';

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  parseTheme,
  readThemeFromCookieHeader,
  themeCookieString,
} from './theme';

describe('parseTheme', () => {
  it.each(['system', 'light', 'dark'] as const)('geçerli değer %s aynen döner', (value) => {
    expect(parseTheme(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    '',
    'Dark',
    'DARK',
    ' dark',
    'auto',
    'sepia',
    '1',
    'dark;x',
    'system ',
  ])('geçersiz çerez (%j) sistem olur', (value) => {
    expect(parseTheme(value)).toBe('system');
  });
});

describe('readThemeFromCookieHeader', () => {
  it('çerez dizgisinden tercihi okur; sıra ve boşluk önemsiz', () => {
    expect(readThemeFromCookieHeader('a=1; theme=dark; b=2')).toBe('dark');
    expect(readThemeFromCookieHeader('theme=light')).toBe('light');
    expect(readThemeFromCookieHeader('b=2;theme=system')).toBe('system');
  });

  it('çerez yok ya da bozuk ise sistem; benzer ada kanmaz', () => {
    expect(readThemeFromCookieHeader('')).toBe('system');
    expect(readThemeFromCookieHeader(null)).toBe('system');
    expect(readThemeFromCookieHeader('theme=mor')).toBe('system');
    expect(readThemeFromCookieHeader('mytheme=dark; themes=dark')).toBe('system');
    expect(readThemeFromCookieHeader('theme')).toBe('system');
  });
});

describe('themeCookieString', () => {
  it('bir yıl, kök yol, SameSite=Lax; httpOnly değil (istemci yazar)', () => {
    const value = themeCookieString('dark', false);
    expect(value).toBe(
      `${THEME_COOKIE}=dark; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`,
    );
    expect(THEME_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(value).not.toMatch(/HttpOnly/i);
  });

  it('Secure yalnız https’te eklenir', () => {
    expect(themeCookieString('light', true)).toMatch(/; Secure$/);
    expect(themeCookieString('light', false)).not.toMatch(/Secure/);
  });

  it('yazılan çerez geri okununca aynı tercihi verir', () => {
    for (const theme of ['system', 'light', 'dark'] as const)
      expect(readThemeFromCookieHeader(themeCookieString(theme, false))).toBe(theme);
  });
});
