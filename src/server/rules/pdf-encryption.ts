/**
 * PDF şifre tespiti (saf; yeni bağımlılık yok). Dosyanın bütün metninde `/Encrypt` aramak, metninde, yorumunda ya da
 * bir dizesinde bu yazı geçen şifresiz PDF'i "şifreli" sayardı (kart 557). Şifre bilgisi yalnız YAPIDA bulunur:
 * `trailer` sözlüğünde ve (PDF 1.5) çapraz başvuru akışı nesnesinin (`/Type /XRef`) sözlüğünde `/Encrypt` ANAHTARI.
 * Artımlı güncellemeli dosyada birden çok trailer vardır; herhangi birinde anahtar varsa dosya şifrelidir.
 *
 * Yöntem: dosya baştan sona üst düzeyde jetonlanır; yorumlar, dizeler ve akış gövdeleri (`stream … endstream`) atlanır,
 * yalnız `trailer` ve `N G obj` sözcüklerinden sonra gelen sözlüğün ÜST DÜZEY anahtarlarına bakılır. Ad kaçışları
 * (`/#45ncrypt`) çözülür. Sözcük bir değerde (`/Foo /Encrypt`) ya da iç sözlükte geçerse sayılmaz.
 */
export type PdfEncryptionScan = {
  /** Bir trailer ya da çapraz başvuru akışı sözlüğünde `/Encrypt` anahtarı var. */
  encrypted: boolean;
  /** Bir `trailer` sözcüğü okunabilir bir sözlükle devam etmiyor (bozuk/kesik trailer). */
  damaged: boolean;
};

const MAX_DEPTH = 24;
/** Bozuk sözlükte şifre ipucu aranacak en çok bayt (yapı okunamadığında yalnız muhafazakâr yedek). */
const DAMAGED_LOOKAHEAD = 4096;

const isWhite = (code: number) =>
  code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
const DELIMITERS = '()<>[]{}/%';
const isDelimiter = (char: string) => DELIMITERS.includes(char);

/** Boşluk ve yorumları (`%` … satır sonu) atlar. */
function skipSpace(source: string, from: number): number {
  let index = from;
  for (;;) {
    while (index < source.length && isWhite(source.charCodeAt(index))) index += 1;
    if (source[index] !== '%') return index;
    while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
  }
}

function readName(source: string, from: number): { name: string; end: number } {
  let index = from + 1;
  while (
    index < source.length &&
    !isWhite(source.charCodeAt(index)) &&
    !isDelimiter(source[index]!)
  )
    index += 1;
  const name = source
    .slice(from + 1, index)
    .replace(/#([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return { name, end: index };
}

/** `(`…`)` dizesi: kaçışlar ve iç içe parantezler. Kapanmıyorsa `null`. */
function skipLiteralString(source: string, from: number): number | null {
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') index += 1;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

type Value = { end: number; name?: string };
type Dictionary = { end: number; keys: Set<string>; type?: string };

function parseValue(source: string, from: number, depth: number): Value | null {
  if (depth > MAX_DEPTH) return null;
  const index = skipSpace(source, from);
  const char = source[index];
  if (char === undefined) return null;
  if (char === '/') {
    const { name, end } = readName(source, index);
    return { end, name };
  }
  if (char === '(') {
    const end = skipLiteralString(source, index);
    return end === null ? null : { end };
  }
  if (char === '<') {
    if (source[index + 1] === '<') {
      const dictionary = parseDictionary(source, index, depth + 1);
      return dictionary ? { end: dictionary.end } : null;
    }
    const close = source.indexOf('>', index + 1);
    return close < 0 ? null : { end: close + 1 };
  }
  if (char === '[') {
    let cursor = index + 1;
    for (;;) {
      cursor = skipSpace(source, cursor);
      if (cursor >= source.length) return null;
      if (source[cursor] === ']') return { end: cursor + 1 };
      const item = parseValue(source, cursor, depth + 1);
      if (!item) return null;
      cursor = item.end;
    }
  }
  if (isDelimiter(char)) return null;
  // Sayı, mantıksal değer, null ya da dolaylı başvuru (`n g R`).
  let end = index;
  while (end < source.length && !isWhite(source.charCodeAt(end)) && !isDelimiter(source[end]!))
    end += 1;
  if (/^\d+$/.test(source.slice(index, end))) {
    const reference = /^[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+R(?=[\0\t\n\f\r /<>[\]()%]|$)/.exec(
      source.slice(end, end + 48),
    );
    if (reference) return { end: end + reference[0].length };
  }
  return { end };
}

/** `<<` ile başlayan sözlüğü okur; yalnız ÜST DÜZEY anahtarları ve `/Type` değerini döndürür. */
function parseDictionary(source: string, from: number, depth: number): Dictionary | null {
  let index = from + 2;
  const keys = new Set<string>();
  let type: string | undefined;
  for (;;) {
    index = skipSpace(source, index);
    if (index >= source.length) return null;
    if (source[index] === '>' && source[index + 1] === '>') return { end: index + 2, keys, type };
    if (source[index] !== '/') return null;
    const key = readName(source, index);
    const value = parseValue(source, key.end, depth);
    if (!value) return null;
    keys.add(key.name);
    if (key.name === 'Type' && value.name !== undefined) type = value.name;
    index = value.end;
  }
}

export function scanPdfEncryption(source: string): PdfEncryptionScan {
  let encrypted = false;
  let damaged = false;
  const size = source.length;
  let index = 0;
  while (index < size) {
    index = skipSpace(source, index);
    if (index >= size) break;
    const char = source[index]!;
    if (char === '(') {
      index = skipLiteralString(source, index) ?? size;
      continue;
    }
    if (char === '<') {
      if (source[index + 1] === '<') {
        const dictionary = parseDictionary(source, index, 0);
        index = dictionary ? dictionary.end : index + 2;
      } else {
        const close = source.indexOf('>', index + 1);
        index = close < 0 ? size : close + 1;
      }
      continue;
    }
    if (char === '[') {
      index = parseValue(source, index, 0)?.end ?? index + 1;
      continue;
    }
    let end = index;
    while (end < size && !isWhite(source.charCodeAt(end)) && !isDelimiter(source[end]!)) end += 1;
    if (end === index) {
      index += 1; // beklenmeyen ayraç (`)`, `>`, `]` …)
      continue;
    }
    const token = source.slice(index, end);
    index = end;
    if (token === 'stream') {
      const close = source.indexOf('endstream', index);
      index = close < 0 ? size : close + 'endstream'.length;
    } else if (token === 'trailer') {
      const at = skipSpace(source, index);
      if (!source.startsWith('<<', at)) {
        damaged = true;
        continue;
      }
      const dictionary = parseDictionary(source, at, 0);
      if (dictionary) {
        if (dictionary.keys.has('Encrypt')) encrypted = true;
        index = dictionary.end;
      } else {
        damaged = true;
        if (/\/Encrypt\b/.test(source.slice(at, at + DAMAGED_LOOKAHEAD))) encrypted = true;
        index = at + 2;
      }
    } else if (token === 'obj') {
      const at = skipSpace(source, index);
      if (!source.startsWith('<<', at)) continue;
      const dictionary = parseDictionary(source, at, 0);
      if (dictionary) {
        if (dictionary.type === 'XRef' && dictionary.keys.has('Encrypt')) encrypted = true;
        index = dictionary.end;
      } else index = at + 2;
    }
  }
  return { encrypted, damaged };
}
