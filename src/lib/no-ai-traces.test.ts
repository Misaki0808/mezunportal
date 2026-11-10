import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hasSparkle, isPinkishAccent } from './ai-traces';

// Kural `./ai-traces` saf işlevlerindedir (sentetik girdiyle sınanır); bu test yalnız gerçek kaynağa/kataloğa/belirtece bağlar.
const ROOT = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('AI izi temizliği (gerçek kaynağa bağ)', () => {
  it('kaynakta ve mesaj kataloğunda süs yıldızı/ışıltı karakteri yoktur', () => {
    const found = sourceFiles(ROOT).filter((file) => hasSparkle(readFileSync(file, 'utf8')));
    expect(found.map((file) => file.slice(ROOT.length))).toEqual([]);
    expect(hasSparkle(readFileSync(join(process.cwd(), 'messages', 'tr.json'), 'utf8'))).toBe(
      false,
    );
  });

  it('mercan belirteci pembeye kayıktır (Claude turuncusundan uzak)', () => {
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const accent = /--color-accent:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] ?? '';
    expect(isPinkishAccent(accent)).toBe(true);
  });
});
