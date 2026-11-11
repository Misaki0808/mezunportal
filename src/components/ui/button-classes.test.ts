import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buttonClasses } from './button-classes';

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('buttonClasses', () => {
  it('sunucu bileşenleri çağırabilsin diye istemci modülünde değildir ve barrel oradan dışa aktarır', () => {
    expect(read('./button-classes.ts')).not.toMatch(/^['"]use client['"]/m);
    expect(read('./button.tsx')).toMatch(/^'use client'/);
    // Barrel'dan `./button` (istemci) üzerinden dışa aktarılırsa sunucuda "client function" hatası verir.
    expect(read('./index.ts')).toContain("export { buttonClasses } from './button-classes';");
    expect(read('./index.ts')).not.toMatch(/export \{[^}]*buttonClasses[^}]*\} from '\.\/button';/);
  });

  it('varyant, boyut ve tam genişlik sınıfları üretir', () => {
    expect(buttonClasses()).toContain('bg-primary');
    expect(buttonClasses({ variant: 'ghost', size: 'lg', fullWidth: true })).toEqual(
      expect.stringContaining('w-full'),
    );
    expect(buttonClasses({ variant: 'secondary' })).toContain('border-border-control');
  });
});
