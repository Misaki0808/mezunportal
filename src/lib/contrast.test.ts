import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { contrastRatio, readColorTokens, readDarkColorTokens } from '@/lib/contrast';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const SCHEMES = {
  açık: readColorTokens(css),
  koyu: readDarkColorTokens(css),
} as const;

// WCAG AA (docs/design.md "Erişilebilirlik kapısı"): normal metin 4.5:1, arayüz sınırı 3:1.
// Çift listesi bileşenlerde gerçekten yan yana kullanılan renkleri kapsar; HER İKİ tema için koşar.
const TEXT_PAIRS: readonly [string, string][] = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg', 'surface-strong'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['fg-muted', 'surface-strong'],
  ['fg-subtle', 'bg'],
  ['fg-subtle', 'surface'],
  ['fg-subtle', 'surface-strong'],
  ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'],
  ['primary', 'bg'],
  ['primary', 'surface'],
  ['on-primary-soft', 'primary-soft'],
  // Ghost düğme hover'ı: soft zeminde metin primary-hover (primary / primary-soft AA DEĞİLDİR, aşağıdaki bekçi kullanımı engeller).
  ['primary-hover', 'primary-soft'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['on-accent-soft', 'accent-soft'],
  ['accent-strong', 'bg'],
  ['accent-strong', 'surface'],
  ['on-success-soft', 'success-soft'],
  ['on-warning-soft', 'warning-soft'],
  ['on-danger-soft', 'danger-soft'],
  ['on-danger', 'danger'],
  ['on-danger', 'danger-hover'],
  ['danger', 'bg'],
  ['danger', 'danger-soft'],
];

const BOUNDARY_PAIRS: readonly [string, string][] = [
  ['border-control', 'bg'],
  ['border-control', 'surface'],
  ['primary', 'bg'],
  ['primary', 'primary-soft'],
  ['danger', 'bg'],
  ['success', 'bg'],
  ['success', 'success-soft'],
  ['warning', 'warning-soft'],
];

describe.each(Object.entries(SCHEMES))('token kontrastı, %s tema (WCAG AA)', (_scheme, tokens) => {
  const ratio = (foreground: string, background: string): number => {
    const fg = tokens[foreground];
    const bg = tokens[background];
    if (!fg || !bg) throw new Error(`Token yok: ${foreground} / ${background}`);
    return contrastRatio(fg, bg);
  };

  it.each(TEXT_PAIRS)('%s / %s ≥ 4.5:1 (normal metin)', (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BOUNDARY_PAIRS)('%s / %s ≥ 3:1 (arayüz sınırı)', (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});

describe('token tanımı', () => {
  it('koyu tema açık temadaki HER renk token’ını yeniden tanımlar (yarım tema yok)', () => {
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    for (const name of Object.keys(SCHEMES.açık))
      expect(dark, `--color-${name} koyu temada yok`).toContain(`--color-${name}:`);
  });

  it('marka paleti İris + Mercan + Nane (kullanıcı kararı; İÜ renkleri değil)', () => {
    expect(SCHEMES.açık.primary).toBe('#5b5bf6');
    expect(SCHEMES.açık.accent).toBe('#ff7a59');
    expect(SCHEMES.açık.success).toBe('#0f9f8f');
    expect(SCHEMES.koyu.primary).toBe('#8b8bff');
    expect(SCHEMES.koyu.bg).toBe('#0e0d1a');
  });

  it('bilinen çift için oran doğru hesaplanır (siyah/beyaz = 21:1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('açık temada mercan zeminde beyaz metin AA değildir (on-accent koyu) ve mercan beyaz üstünde sınır/metin olamaz (accent-strong)', () => {
    expect(contrastRatio('#ffffff', SCHEMES.açık.accent!)).toBeLessThan(4.5);
    expect(contrastRatio(SCHEMES.açık.accent!, SCHEMES.açık.bg!)).toBeLessThan(3);
  });
});

describe('bekçi: primary metni primary-soft üstünde kullanılmaz (açık temada 4,34:1, AA değil)', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
  }
  it('aynı sınıf dizgesinde `*-primary-soft` zemin ile çıplak `text-primary` birlikte geçmez', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(fileURLToPath(new URL('..', import.meta.url)))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /(['"`])((?:(?!\1)[^\n])*primary-soft(?:(?!\1)[^\n])*)\1/g,
      )) {
        const classes = match[2]!;
        const bareText = /(^|\s)text-primary(?![-\w])/.test(classes);
        const softAlways = /(^|\s)bg-primary-soft(?![-\w])/.test(classes);
        const softOnHover = /hover:bg-primary-soft/.test(classes) && !/hover:text-/.test(classes);
        if (bareText && (softAlways || softOnHover)) offenders.push(`${file}: ${classes}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
