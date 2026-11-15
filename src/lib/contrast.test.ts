import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  readColorTokens,
  readDarkColorTokens,
  readManualDarkDeclarations,
  readSystemDarkDeclarations,
} from '@/lib/contrast';

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
  // Ghost düğme hover'ı: soft zeminde metin primary-hover (primary / primary-soft AA DEĞİLDİR, lint kuralı kullanımı engeller).
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
  // Yan menü (iki temada da lacivert): metin, soluk metin, etkin öğe ve alt kart zemininde.
  ['side-fg', 'side-bg'],
  ['side-muted', 'side-bg'],
  ['side-fg', 'side-active'],
  ['side-muted', 'side-active'],
  ['side-fg', 'side-foot'],
  ['side-muted', 'side-foot'],
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
  // Yan menüde etkin öğenin solundaki 3 px mercan çizgi.
  ['accent', 'side-bg'],
  ['accent', 'side-active'],
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
    const dark = readManualDarkDeclarations(css);
    const system = readSystemDarkDeclarations(css);
    for (const name of Object.keys(SCHEMES.açık)) {
      expect(dark, `--color-${name} elle koyu temada yok`).toHaveProperty(`--color-${name}`);
      expect(system, `--color-${name} sistem koyusunda yok`).toHaveProperty(`--color-${name}`);
    }
  });

  it('marka paleti İris + Mercan + Nane (kullanıcı kararı; İÜ renkleri değil)', () => {
    expect(SCHEMES.açık.primary).toBe('#5b5bf6');
    expect(SCHEMES.açık.accent).toBe('#ff6b7f');
    expect(SCHEMES.açık.bg).toBe('#f4f5fa'); // görünüm A: soğuk kâğıt (kullanıcı kararı, 15 Kasım; ölçüdeki #f3f4f9 AA'nın altında kaldı)
    expect(SCHEMES.açık.success).toBe('#0f9f8f');
    expect(SCHEMES.koyu.primary).toBe('#a3a3ff');
    expect(SCHEMES.koyu.bg).toBe('#0e1a38');
  });

  it('yan menü iki temada da laciverttir (görünüm A); kart zemini açık temada beyazdır', () => {
    expect(SCHEMES.açık['side-bg']).toBe('#0e1a38');
    expect(SCHEMES.koyu['side-bg']).toBe('#0a1430');
    expect(SCHEMES.açık.surface).toBe('#ffffff');
    expect(SCHEMES.koyu.surface).toBe('#15254a');
  });

  it('koyu logo yeni lacivert zeminde okunur', () => {
    for (const color of ['#f4f2ff', '#a3a3ff', '#ff8798'])
      expect(contrastRatio(color, SCHEMES.koyu.bg!)).toBeGreaterThanOrEqual(4.5);
  });

  it('bilinen çift için oran doğru hesaplanır (siyah/beyaz = 21:1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('açık temada mercan zeminde beyaz metin AA değildir (on-accent koyu) ve mercan beyaz üstünde sınır/metin olamaz (accent-strong)', () => {
    expect(contrastRatio('#ffffff', SCHEMES.açık.accent!)).toBeLessThan(4.5);
    expect(contrastRatio(SCHEMES.açık.accent!, SCHEMES.açık.bg!)).toBeLessThan(3);
  });
});

describe('tema blokları (kart 383: Sistem / Açık / Koyu)', () => {
  it('sistem koyusu elle koyuyla BİREBİR aynı değerleri taşır (iki blok sapamaz)', () => {
    const manual = readManualDarkDeclarations(css);
    const system = readSystemDarkDeclarations(css);
    expect(Object.keys(manual).length).toBeGreaterThan(30);
    expect(system).toEqual(manual);
  });

  it('color-scheme üç durumda doğru: sistem açık+koyu, elle açık, elle koyu', () => {
    expect(readManualDarkDeclarations(css)['color-scheme']).toBe('dark');
    expect(readSystemDarkDeclarations(css)['color-scheme']).toBe('dark');
    expect(css).toMatch(/:root\[data-theme='light'\]\s*\{\s*color-scheme:\s*light;\s*\}/);
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*light dark;/);
  });

  it('sistem koyusu yalnız açık SEÇİLMEDİYSE uygulanır (elle açık sistem koyusunu ezer)', () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{/,
    );
  });

  it('`dark:` varyantı elle koyuya ve (açık seçilmediyse) sistem koyusuna bağlıdır', () => {
    const variant = css.slice(css.indexOf('@custom-variant dark'));
    expect(variant).toContain("[data-theme='dark']");
    expect(variant).toContain('@media (prefers-color-scheme: dark)');
    expect(variant).toContain(":root:not([data-theme='light'])");
  });
});

describe('tanıtım sayfası metin renkleri', () => {
  it('adım numarası sabit gri yerine AA belirteç kullanır (R1 bulgusu: #77758b 4,36:1)', () => {
    const landing = readFileSync(
      new URL('../components/landing/landing.css', import.meta.url),
      'utf8',
    );
    expect(landing).not.toContain('#77758b');
    const rule = /\.landing-step-number \{[^}]*\}/.exec(landing)?.[0] ?? '';
    expect(rule).toContain('color: var(--color-fg-muted)');
  });
});
