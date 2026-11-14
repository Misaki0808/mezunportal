import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { dataExportSchema } from './privacy';

type Def = { type: string; [key: string]: unknown };
const defOf = (schema: unknown): Def => (schema as { _zod: { def: Def } })._zod.def;

/** Sözleşmedeki her nesneyi gezer; `strict` olmayanın yolunu toplar (kart 372). */
function notStrict(schema: z.ZodType, path: string, found: string[]): void {
  const def = defOf(schema);
  switch (def.type) {
    case 'object': {
      const catchall = def.catchall as z.ZodType | undefined;
      if (!catchall || defOf(catchall).type !== 'never') found.push(path || '(kök)');
      for (const [key, child] of Object.entries(def.shape as Record<string, z.ZodType>))
        notStrict(child, path ? `${path}.${key}` : key, found);
      break;
    }
    case 'array':
      notStrict(def.element as z.ZodType, `${path}[]`, found);
      break;
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
      notStrict(def.innerType as z.ZodType, path, found);
      break;
    case 'union':
      for (const option of def.options as z.ZodType[]) notStrict(option, path, found);
      break;
    default:
      break;
  }
}

describe('döküm sözleşmesi: her nesne strict', () => {
  it('sözleşmede olmayan anahtar her düzeyde reddedilir (mühür onu çıktıdan atar, yanlışlıkla eklenen alan kullanıcıya gitmez)', () => {
    const found: string[] = [];
    notStrict(dataExportSchema, '', found);
    expect(found).toEqual([]);
  });
});
