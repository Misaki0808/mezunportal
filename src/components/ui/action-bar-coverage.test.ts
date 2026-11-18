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

describe('yapışkan alt kaplar', () => {
  it('alt gezinme üstüne yapışan her kap ActionBar ile çizilir', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!BOTTOM.test(line)) return;
        // Açılış etiketi: bu satır ya da önceki en çok üç satırdaki son '<' ile başlayan etiket.
        const context = lines.slice(Math.max(0, index - 3), index + 1).join('\n');
        const tag = context
          .slice(context.lastIndexOf('<', context.indexOf(line.trim())))
          .match(/^<(\w+)/)?.[1];
        if (tag !== 'ActionBar') offenders.push(`${file}:${index + 1} (<${tag ?? '?'}>)`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
