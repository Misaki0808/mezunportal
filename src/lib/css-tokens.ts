/**
 * Renk belirteci kuralları (saf işlevler; dosya okumaz). Kanonik kaynak CSS'tir (AGENTS.md §4): kural burada, testler
 * işlevi sentetik metinle sınar; gerçek dosyayı okuyan test yalnız ince bir bağdır.
 */

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** Seçicinin ilk bloğunu (`{`…`}`) ve bloğun dışında kalan CSS'i ayırır. Seçici yoksa `block` boştur. */
export function splitBlock(css: string, selector: string): { block: string; rest: string } {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return { block: '', rest: css };
  const end = css.indexOf('}', start);
  return { block: css.slice(start, end), rest: css.slice(0, start) + css.slice(end) };
}

/** Metindeki sabit `#hex` renkleri (kural gövdelerinde yasak; belirteç tanımında serbest). */
export function hexColors(text: string): string[] {
  return text.match(HEX) ?? [];
}

/** Tanım bloğundaki, `--<önek>*: #hex;` biçimine UYMAYAN ama hex içeren satırlar (blok yalnız belirteç tanımı olmalı). */
export function malformedTokenLines(block: string, prefix: string): string[] {
  const valid = new RegExp(`^--${prefix}[a-z0-9-]*: #[0-9a-fA-F]{3,8};$`);
  return block
    .split('\n')
    .filter((line) => hexColors(line).length > 0 && !valid.test(line.trim()))
    .map((line) => line.trim());
}

/** `var(--<önek>*)` ile kullanılıp `--<önek>*:` ile tanımlanmamış değişkenler (görünümü bozar). */
export function undefinedVariables(css: string, prefix: string): string[] {
  const defined = new Set(
    [...css.matchAll(new RegExp(`--(${prefix}[a-z0-9-]*):`, 'g'))].map((m) => m[1] ?? ''),
  );
  const used = new Set(
    [...css.matchAll(new RegExp(`var\\(--(${prefix}[a-z0-9-]*)\\)`, 'g'))].map((m) => m[1] ?? ''),
  );
  return [...used].filter((name) => !defined.has(name)).sort();
}
