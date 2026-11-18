import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Telefonda alta yapışan her kap `ActionBar` olmalı (kart 453, R2 455 B1: üyelik formunun son eylem kabı çubuk işareti
 * taşımadığı için toast onu örtüyordu). Kaynak taraması: `sticky`/`fixed` + alt gezinme üstü ofseti (`bottom-20`,
 * `bottom-[calc(4.5rem…`) taşıyan sınıf dizisinin bulunduğu açılış etiketi `<ActionBar` olmalı.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}
const BOTTOM = /(sticky|fixed)[^"'`]*\bbottom-(20|\[calc\(4\.5rem)/;

/**
 * `ActionBar` çağıranı `sticky`/`fixed`/`bottom-*` VERMEZ: telefondaki konumu kap belirler (sabit, alt gezinmenin üstünde).
 * Yalnız `lg:` önekli olanlara izin var (masaüstünde eski davranış, örn. `lg:sticky lg:bottom-0`).
 */
const POSITIONING = /(?<![\w:-])(sticky|fixed|bottom-)/;

describe('yapışkan alt kaplar', () => {
  it('.sticky-actions kalmadı: alt çubukların hepsi ActionBar ile çizilir (kart 477)', () => {
    const offenders = [...walk('src'), 'src/app/globals.css'].filter((file) =>
      /sticky-actions/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('ActionBar çağıranları konum sınıfı vermez; konumu kap belirler', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      if (file.endsWith('action-bar.tsx')) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/<ActionBar\b/g)) {
        // Açılış etiketi: ilk satır sonu `>`'ya kadar (sınıf dizileri `>` ile biter satır sonuna gelmez).
        const rest = text.slice(match.index);
        const tag = rest.slice(0, rest.search(/>\s*$/m) + 1);
        const found = tag.match(POSITIONING);
        if (found) offenders.push(`${file}: "${found[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('alt gezinme üstüne yapışan her kap ActionBar ile çizilir', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!BOTTOM.test(line)) return;
        // Açılış etiketi: bu satırdan geriye (en çok 8 satır) bakılan son `<Etiket`.
        const context = lines.slice(Math.max(0, index - 8), index + 1).join('\n');
        const tag = [...context.matchAll(/<([A-Za-z][\w.]*)(?=[\s>])/g)].at(-1)?.[1];
        if (tag !== 'ActionBar') offenders.push(`${file}:${index + 1} (<${tag ?? '?'}>)`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
