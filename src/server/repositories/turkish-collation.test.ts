import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TURKISH_COLLATION,
  resetTurkishCollationCache,
  turkishCollate,
  turkishCollationAvailable,
} from './turkish-collation';

const fakeDb = (impl: () => Promise<{ ok: boolean }[]>) => ({ $queryRaw: vi.fn(impl) }) as never;
beforeEach(() => resetTurkishCollationCache());

describe('Türkçe harmanlama denetimi', () => {
  it('ICU harmanlaması varsa ORDER BY parçası COLLATE içerir; yoklama süreç başına bir kezdir', async () => {
    const db = fakeDb(async () => [{ ok: true }]);
    expect((await turkishCollate(db)).sql).toBe(`COLLATE "${TURKISH_COLLATION}"`);
    await turkishCollate(db);
    expect((db as unknown as { $queryRaw: unknown }).$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('ICU harmanlaması yoksa parça boştur: sorgu hata vermez, varsayılan sıraya düşer', async () => {
    const db = fakeDb(async () => [{ ok: false }]);
    expect(await turkishCollationAvailable(db)).toBe(false);
    expect((await turkishCollate(db)).sql).toBe('');
  });

  it('yoklama hata verirse sorgu düşmez; sonuç önbelleğe alınmaz, sonraki çağrı yeniden dener', async () => {
    const db = fakeDb(async () => {
      throw new Error('bağlantı yok');
    });
    expect((await turkishCollate(db)).sql).toBe('');
    const ok = fakeDb(async () => [{ ok: true }]);
    expect((await turkishCollate(ok)).sql).toContain('COLLATE');
  });
});
