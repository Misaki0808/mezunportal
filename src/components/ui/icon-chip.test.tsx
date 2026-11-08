// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';
import { IconChip } from './icon-chip';

describe('IconChip ve Badge accent', () => {
  it.each([
    ['primary', 'bg-primary-soft', 'text-on-primary-soft'],
    ['accent', 'bg-accent-soft', 'text-on-accent-soft'],
    ['success', 'bg-success-soft', 'text-on-success-soft'],
  ] as const)('%s çipi yalnız token sınıfları kullanır ve dekoratiftir', (tone, bg, fg) => {
    const { container } = render(<IconChip tone={tone}>x</IconChip>);
    const chip = container.firstElementChild!;
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(chip.className).toContain(bg);
    expect(chip.className).toContain(fg);
    expect(chip.className).not.toMatch(/#|text-white/);
  });

  it('varsayılan ton İris; Badge accent Mercan soft + koyu metin tokenlarını kullanır', () => {
    expect(render(<IconChip>x</IconChip>).container.firstElementChild!.className).toContain(
      'bg-primary-soft',
    );
    const { getByText } = render(<Badge tone="accent">Yeni</Badge>);
    expect(getByText('Yeni').className).toContain('bg-accent-soft');
    expect(getByText('Yeni').className).toContain('text-on-accent-soft');
  });
});
