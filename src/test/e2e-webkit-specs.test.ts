import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chromiumSpecFilter, webkitSpecFilter, WEBKIT_SPEC } from '../../tests/e2e/webkit-specs';

// Playwright deseni dosyanın MUTLAK yoluna uygular: yolunda `webkit-` geçen çalışma kopyası (`worktrees/r1-webkit-p3`) yüzünden
// bütün spec'ler Chromium projesinden düşüyor, `E2E_WEBKIT=1`'de bütün paket WebKit'e kayıyordu.
describe('webkit-*.spec.ts deseni', () => {
  it('WebKit spec dosyalarına uyar (yola bakmadan, yalnız dosya adına)', () => {
    expect(WEBKIT_SPEC.test('/repo/tests/e2e/webkit-iphone.spec.ts')).toBe(true);
    expect(WEBKIT_SPEC.test('tests/e2e/webkit-iphone.spec.ts')).toBe(true);
    expect(WEBKIT_SPEC.test('webkit-iphone.spec.ts')).toBe(true);
    expect(WEBKIT_SPEC.test('C:\\repo\\tests\\e2e\\webkit-iphone.spec.ts')).toBe(true);
  });

  it('yolunda `webkit-` geçen dizindeki sıradan spec dosyalarına UYMAZ', () => {
    for (const file of [
      '/Users/x/worktrees/r1-webkit-p3/tests/e2e/search.spec.ts',
      '/tmp/webkit-run/tests/e2e/home.spec.ts',
      '/tmp/webkit-run/tests/e2e/webkit-sub/home.spec.ts',
      'C:\\w\\webkit-tur\\tests\\e2e\\home.spec.ts',
    ])
      expect(WEBKIT_SPEC.test(file), file).toBe(false);
  });

  it('adın başında `webkit-` olmayan dosyalara uymaz (`e2e-webkit-x`, `not-webkit-x`)', () => {
    expect(WEBKIT_SPEC.test('/repo/tests/e2e/not-webkit-iphone.spec.ts')).toBe(false);
    expect(WEBKIT_SPEC.test('/repo/tests/e2e/e2e-webkit-x.spec.ts')).toBe(false);
    expect(WEBKIT_SPEC.test('/repo/tests/e2e/webkit-iphone.test.ts')).toBe(false);
    // Sonu da bağlı: yedek dosya ya da başka uzantı WebKit spec'i sayılmaz.
    expect(WEBKIT_SPEC.test('/repo/tests/e2e/webkit-iphone.spec.ts.bak')).toBe(false);
  });

  it('Chromium projesi yalnız `webkit-*` dosyalarını atlar; tuzak yolu atlamaz', () => {
    const { testIgnore } = chromiumSpecFilter;
    expect(testIgnore.test('/repo/tests/e2e/webkit-iphone.spec.ts')).toBe(true);
    expect(testIgnore.test('/Users/x/r1-webkit-p3/tests/e2e/search.spec.ts')).toBe(false);
  });

  it('WebKit projesi: E2E_WEBKIT=1 yalnız `webkit-*`, `all` ve boşta süzgeç yok', () => {
    const only = webkitSpecFilter('1');
    expect(only.testMatch?.test('/repo/tests/e2e/webkit-iphone.spec.ts')).toBe(true);
    expect(only.testMatch?.test('/Users/x/r1-webkit-p3/tests/e2e/search.spec.ts')).toBe(false);
    expect(webkitSpecFilter('all')).toEqual({});
    expect(webkitSpecFilter(undefined)).toEqual({});
  });

  it('klasörde gerçekten var olan webkit-*.spec.ts dosyalarının hepsi eşleşir, diğerleri eşleşmez', () => {
    const dir = path.resolve(process.cwd(), 'tests/e2e');
    const specs = readdirSync(dir).filter((name) => name.endsWith('.spec.ts'));
    const webkit = specs.filter((name) => name.startsWith('webkit-'));
    expect(webkit.length).toBeGreaterThan(0);
    expect(specs.filter((name) => WEBKIT_SPEC.test(path.join(dir, name)))).toEqual(webkit);
  });
});
