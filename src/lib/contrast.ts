/** WCAG 2.x göreli parlaklık ve kontrast oranı (yalnız `#rrggbb` renkler). */

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Geçersiz renk: ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) =>
    channel(parseInt(part ?? '0', 16)),
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function tokensIn(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value;
  }
  return tokens;
}

/** `marker`dan sonraki ilk `{ … }` bloğunun içi (iç içe parantezler dengelenir); yoksa boş. */
function blockAfter(css: string, marker: string): string {
  const at = css.indexOf(marker);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && (depth -= 1) === 0) return css.slice(open + 1, i);
  }
  return '';
}

/** Açık tema token'ları: `@theme` bloğu (rgb()/alfa değerleri atlanır). */
export function readColorTokens(css: string): Record<string, string> {
  return tokensIn(blockAfter(css, '@theme'));
}

/** Koyu tema (elle seçim, `:root[data-theme='dark']`): açık temanın üstüne geçersiz kılmalar. */
export function readDarkColorTokens(css: string): Record<string, string> {
  return {
    ...readColorTokens(css),
    ...tokensIn(blockAfter(css, ":root[data-theme='dark']")),
  };
}

/** Bir bloktaki bütün özel özellikler (`--x`) ve `color-scheme`; boşluk ve yorumlar atılır. */
export function declarationsIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/(--[a-z0-9-]+|color-scheme)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) out[name] = value.replace(/\s+/g, ' ').trim();
  }
  return out;
}

/** Elle koyu bloğun bildirimleri. */
export function readManualDarkDeclarations(css: string): Record<string, string> {
  return declarationsIn(blockAfter(css, ":root[data-theme='dark']"));
}

/** Sistem koyusu (`@media (prefers-color-scheme: dark)` içindeki `:root:not([data-theme='light'])`) bildirimleri. */
export function readSystemDarkDeclarations(css: string): Record<string, string> {
  const media = blockAfter(css, '@media (prefers-color-scheme: dark)');
  return declarationsIn(blockAfter(media, ':root'));
}
