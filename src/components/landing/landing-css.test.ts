import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./landing.css', import.meta.url), 'utf8');
const rootEnd = css.indexOf('}', css.indexOf('.landing {'));
const root = css.slice(css.indexOf('.landing {'), rootEnd);
const rest = css.slice(0, css.indexOf('.landing {')) + css.slice(rootEnd);

describe('tanıtım stili: sabit renk tek yerde (R1 P2: 64 sabit hex)', () => {
  it('sabit #hex yalnız `.landing` kökündeki --lp-* tanım bloğunda bulunur; kurallar belirteç kullanır', () => {
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    for (const line of root.split('\n').filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l)))
      expect(line.trim()).toMatch(/^--lp-[a-z0-9-]+: #[0-9a-fA-F]{3,8};$/);
  });

  it('kullanılan her --lp-* değişkeni tanımlıdır (tanımsız değişken görünümü bozar)', () => {
    const defined = new Set([...root.matchAll(/--(lp-[a-z0-9-]+):/g)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\(--(lp-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(20);
    for (const name of used) expect(defined, name).toContain(name);
  });

  it('atlama bağlantısı odaklanınca üst çubuğun (72 px) altına iner ve markaya binmez', () => {
    const focus = /\.landing-skip:focus \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(focus).toContain('top: 5rem');
    expect(/\.landing-skip \{[^}]*\}/.exec(css)?.[0]).toContain('top: 0');
  });
});
