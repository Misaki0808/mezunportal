import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { capPage, lastPageIfPast, parseListFilters } from './list-params';

const schema = z
  .object({
    q: z.string().min(2).optional(),
    kind: z.enum(['A', 'B']).optional(),
    page: z.number().int().min(1).max(10).default(1),
  })
  .strict()
  .refine((value) => !(value.q && value.kind), { error: 'çelişki' });

describe('parseListFilters', () => {
  it('geçerli girdiyi olduğu gibi döndürür', () => {
    expect(parseListFilters(schema, { q: 'ab', page: 3 })).toEqual({ q: 'ab', page: 3 });
  });
  it('geçersiz alanı düşürür, geçerli olanları korur', () => {
    expect(parseListFilters(schema, { q: 'a', kind: 'B', page: 'x' })).toEqual({
      kind: 'B',
      page: 1,
    });
  });
  it('birlikte çelişen süzgeçler varsayılana döner', () => {
    expect(parseListFilters(schema, { q: 'ab', kind: 'A', page: 2 })).toEqual({ page: 1 });
  });
  it('bilinmeyen anahtar süzgeçsiz varsayılana yol açmaz, yalnız düşer', () => {
    expect(parseListFilters(schema, { q: 'ab', zzz: 1 })).toEqual({ q: 'ab', page: 1 });
  });
});

describe('capPage', () => {
  it('üst sınırı aşan sayıyı ve metni üst sınıra indirir', () => {
    expect(capPage({ page: 999 }, 200)).toEqual({ page: 200 });
    expect(capPage({ page: '999' }, 200)).toEqual({ page: '200' });
  });
  it('geçerli, sıfır, negatif, kesirli ve sayı olmayan değerlere dokunmaz', () => {
    for (const page of [1, 200, 0, -1, 1.5, 'abc', ''])
      expect(capPage({ page }, 200)).toEqual({ page });
    expect(capPage({ q: 'x' }, 200)).toEqual({ q: 'x' });
  });
});

describe('lastPageIfPast', () => {
  it('son sayfa içindeyse null', () => {
    expect(lastPageIfPast(1, 0, 20)).toBeNull();
    expect(lastPageIfPast(16, 303, 20)).toBeNull();
  });
  it('aralık dışıysa son geçerli sayfa; sonuç yoksa 1', () => {
    expect(lastPageIfPast(17, 303, 20)).toBe(16);
    expect(lastPageIfPast(999, 303, 20)).toBe(16);
    expect(lastPageIfPast(5, 0, 20)).toBe(1);
  });
});
