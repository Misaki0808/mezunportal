import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { contrastRatio, readColorTokens } from '@/lib/contrast';

const tokens = readColorTokens(
  readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8'),
);

function ratio(foreground: string, background: string): number {
  const fg = tokens[foreground];
  const bg = tokens[background];
  if (!fg || !bg) throw new Error(`Token yok: ${foreground} / ${background}`);
  return contrastRatio(fg, bg);
}

// WCAG AA (docs/design.md "Erişilebilirlik kapısı"): normal metin 4.5:1, arayüz sınırı 3:1.
// Çift listesi bileşenlerde gerçekten yan yana kullanılan renkleri kapsar.
const TEXT_PAIRS: readonly [string, string][] = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg', 'surface-strong'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['fg-muted', 'surface-strong'],
  ['fg-subtle', 'bg'],
  ['fg-subtle', 'surface'],
  ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'],
  ['primary', 'bg'],
  ['primary', 'primary-soft'],
  ['on-primary-soft', 'primary-soft'],
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
  ['danger', 'bg'],
  ['success', 'success-soft'],
  ['warning', 'warning-soft'],
];

describe('token kontrastı (WCAG AA)', () => {
  it.each(TEXT_PAIRS)('%s / %s ≥ 4.5:1 (normal metin)', (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BOUNDARY_PAIRS)('%s / %s ≥ 3:1 (arayüz sınırı)', (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it('bilinen çift için oran doğru hesaplanır (siyah/beyaz = 21:1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});
