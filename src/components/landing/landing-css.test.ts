import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { hexColors, malformedTokenLines, splitBlock, undefinedVariables } from '@/lib/css-tokens';

// Kural `@/lib/css-tokens` saf işlevlerindedir (sentetik metinle sınanır); bu test yalnız gerçek tanıtım stiline bağlar.
// Atlama bağlantısının markaya binmemesi gerçek geometriyle `tests/e2e/skip-link.spec.ts`'te ölçülür.
const css = readFileSync(new URL('./landing.css', import.meta.url), 'utf8');
const { block, rest } = splitBlock(css, '.landing');

describe('tanıtım stili: sabit renk tek yerde (R1 P2: 64 sabit hex)', () => {
  it('sabit #hex yalnız `.landing` kökündeki --lp-* tanım bloğunda bulunur', () => {
    expect(hexColors(rest)).toEqual([]);
    expect(malformedTokenLines(block, 'lp-')).toEqual([]);
  });

  it('kullanılan her --lp-* değişkeni tanımlıdır', () => {
    expect(undefinedVariables(css, 'lp-')).toEqual([]);
  });
});
