import { describe, expect, it } from 'vitest';
import { buttonClasses } from './button-classes';

describe('buttonClasses', () => {
  it('varyant, boyut ve tam genişlik sınıfları üretir', () => {
    const defaults = buttonClasses().split(' ');
    expect(defaults).toEqual(expect.arrayContaining(['bg-primary', 'min-h-11', 'press-control']));
    expect(defaults).not.toContain('w-full');
    expect(buttonClasses({ variant: 'ghost', size: 'lg', fullWidth: true }).split(' ')).toEqual(
      expect.arrayContaining(['bg-transparent', 'min-h-12', 'w-full']),
    );
    expect(buttonClasses({ variant: 'secondary' }).split(' ')).toContain('border-border-control');
  });
});
