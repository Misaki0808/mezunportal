import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BrandLogo, BrandMark } from './logo';
import { WORDMARK } from './logo-geometry';

describe('mezunportal. logosu', () => {
  it('etiketli çizim erişilebilir ad taşır; etiketsiz çizim dekoratiftir', () => {
    const named = renderToStaticMarkup(<BrandLogo label="mezunportal." />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="mezunportal."');
    const decorative = renderToStaticMarkup(<BrandLogo />);
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('aria-label');
  });

  it('renkler token değişkenidir (koyu temada kendiliğinden döner); sabit #hex yoktur', () => {
    const html = renderToStaticMarkup(<BrandLogo label="x" />);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const name of ['ink', 'iris', 'cap', 'tassel', 'dot'])
      expect(html).toContain(`var(--brand-${name})`);
  });

  it('on bir harf dış hatlıdır (yazı tipine bağlı değil): "mezun" koyu, "n" ile "p" geçişte, "ortal" mor', () => {
    expect(WORDMARK.letters).toHaveLength(11);
    expect(WORDMARK.letters.map((letter) => letter.tone)).toEqual([
      'ink',
      'ink',
      'ink',
      'ink',
      'grad',
      'grad',
      'iris',
      'iris',
      'iris',
      'iris',
      'iris',
    ]);
    const html = renderToStaticMarkup(<BrandLogo label="x" />);
    expect(html).not.toContain('<text');
    // nokta yuvarlak (fontun kare noktası değil) ve kep yatık
    expect(html).toMatch(/<circle[^>]*r="75"/);
    expect(WORDMARK.cap.angle).toBeLessThan(0);
  });

  it('açık tek renk sürümü yalnız beyazdan oluşur ve erişilebilir adı korur', () => {
    const html = renderToStaticMarkup(<BrandLogo variant="mono-light" label="mezunportal." />);
    expect(html).toContain('aria-label="mezunportal."');
    for (const name of ['ink', 'iris', 'cap', 'tassel', 'dot'])
      expect(html).toContain(`--brand-${name}:#fff`);
    expect(html).not.toContain('opacity="0.88"');
  });

  it('iki logo birlikte basılınca geçiş kimlikleri çakışmaz', () => {
    const html = renderToStaticMarkup(
      <>
        <BrandLogo label="a" />
        <BrandLogo label="b" />
      </>,
    );
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('simge yalnız kepli "o": sabit renkli, harf yazısı yok', () => {
    const html = renderToStaticMarkup(<BrandMark label="mezunportal." />);
    expect(html).toContain('viewBox="0 0 512 512"');
    expect(html).not.toContain('<text');
  });
});

describe('public/brand dosyaları', () => {
  const read = (name: string) => readFileSync(join(process.cwd(), 'public', 'brand', name), 'utf8');
  it.each([
    'mezunportal.svg',
    'mezunportal-koyu.svg',
    'mezunportal-siyah-beyaz.svg',
    'mezunportal-beyaz.svg',
    'mezunportal-simge.svg',
    'mezunportal-simge-tam.svg',
  ])('%s geçerli, yazı tipi gerektirmeyen bir SVG', (name) => {
    const svg = read(name);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox=');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('font-family');
  });

  it('beyaz SVG yalnız tam beyaz renk kullanır', () => {
    const svg = read('mezunportal-beyaz.svg');
    expect(new Set(svg.match(/#[a-f0-9]{6}/gi))).toEqual(new Set(['#ffffff']));
    expect(svg).not.toContain('opacity="0.88"');
  });

  it('siyah-beyaz sürümde "portal" gri tonla ayrışır, renkli sürümde mor ve mercan vardır', () => {
    expect(read('mezunportal-siyah-beyaz.svg')).toContain('#5c5c5c');
    const colored = read('mezunportal.svg');
    expect(colored).toContain('#5b5bf6');
    expect(colored).toContain('#ff6b7f');
  });
});
