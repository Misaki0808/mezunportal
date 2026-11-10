import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Kullanıcı kararı (9 Kas): arayüzde yıldız/ışıltı süsü ("AI izi") ve stok görsel yok. Süs simgesi kaynağa sızarsa bu test düşer.
const ROOT = join(process.cwd(), 'src');
const SPARKLE = /[✳✦✧✨⭐★☆❇❈✴✵⚡]/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('AI izi temizliği', () => {
  it('kaynakta süs yıldızı/ışıltı karakteri yoktur', () => {
    const found = sourceFiles(ROOT).filter((file) => SPARKLE.test(readFileSync(file, 'utf8')));
    expect(found.map((file) => file.slice(ROOT.length))).toEqual([]);
  });

  it('mesaj kataloğunda süs yıldızı yoktur', () => {
    expect(SPARKLE.test(readFileSync(join(process.cwd(), 'messages', 'tr.json'), 'utf8'))).toBe(
      false,
    );
  });

  it('mercan Claude turuncusundan (≈#D97757) uzaktır: tonu pembeye kayıktır', () => {
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const accent = /--color-accent:\s*#([0-9a-f]{6})/i.exec(css)?.[1] ?? '';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(accent.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    // turuncu: yeşil bileşen mavi bileşenden belirgin yüksek (≈ +50); pembe-mercanda mavi ≥ yeşil'e yakın veya yüksek
    expect(r).toBeGreaterThan(200);
    expect(b).toBeGreaterThanOrEqual(g);
  });
});
