import { describe, expect, it } from 'vitest';

import { hexColors, malformedTokenLines, splitBlock, undefinedVariables } from './css-tokens';

const css = `
.other { color: #fff; }
.landing {
  --lp-ink: #111;
  --lp-bg: #fcfcfd;
}
.landing-card { color: var(--lp-ink); border-color: var(--lp-bg); }
`;

describe('css-tokens (saf işlevler)', () => {
  it('splitBlock: seçici bloğunu ayırır; bulunamazsa boş blok', () => {
    const { block, rest } = splitBlock(css, '.landing');
    expect(block).toContain('--lp-ink: #111;');
    expect(block).not.toContain('landing-card');
    expect(rest).toContain('.landing-card');
    expect(rest).toContain('.other');
    expect(splitBlock(css, '.yok')).toEqual({ block: '', rest: css });
  });

  it('hexColors: 3/6/8 haneli renkleri yakalar, değişken ve renk adı yakalamaz', () => {
    expect(hexColors('a #fff b #5b5bf6 c #11223344 var(--x) red')).toEqual([
      '#fff',
      '#5b5bf6',
      '#11223344',
    ]);
    expect(hexColors('border: 1px solid var(--lp-ink);')).toEqual([]);
  });

  it('malformedTokenLines: yalnız `--önek-ad: #hex;` satırı kabul edilir', () => {
    expect(malformedTokenLines('  --lp-ink: #111;\n  --lp-bg: #fcfcfd;', 'lp-')).toEqual([]);
    expect(malformedTokenLines('  color: #111;\n  --other: #fff;', 'lp-')).toEqual([
      'color: #111;',
      '--other: #fff;',
    ]);
    expect(malformedTokenLines('  --lp-x: #111 !important;', 'lp-')).toHaveLength(1);
  });

  it('undefinedVariables: kullanılıp tanımsız kalan değişkenler sıralı döner', () => {
    expect(undefinedVariables(css, 'lp-')).toEqual([]);
    expect(
      undefinedVariables(`${css}\n.x { color: var(--lp-zzz); background: var(--lp-aaa); }`, 'lp-'),
    ).toEqual(['lp-aaa', 'lp-zzz']);
  });
});
