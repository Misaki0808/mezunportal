import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isValidStorageKey, newGraduationDocumentKey } from './keys';
import { createLocalStorage } from './local';
import { createMemoryStorage } from './memory';
import { StorageError, type StorageAdapter } from './types';

const bytes = (text: string) => new TextEncoder().encode(text);
const meta = { contentType: 'application/pdf' } as const;

describe('depolama anahtarları', () => {
  it.each([
    'graduation/u1/abc-123.pdf',
    'cv/019a3c2e-7b3d-7a10-8f21-123456789012/019a3c2e-7b3d-7a10-8f21-123456789013.pdf',
    'graduation/0a1f9c3b5d7e9a1b3c5d7e9f/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf',
  ])('geçerli: %s', (key) => {
    expect(isValidStorageKey(key)).toBe(true);
  });

  it.each([
    '',
    '../etc/passwd',
    'graduation/../x/y.pdf',
    'graduation/u1/../../y.pdf',
    'graduation/u1/y.pdf/../z.pdf',
    '/graduation/u1/y.pdf',
    'graduation//y.pdf',
    'graduation/u1/y.PDF',
    'graduation/u1/y.pdf ',
    'graduation/u1/y.exe',
    'graduation/u 1/y.pdf',
    'graduation/u1\\y.pdf',
    'graduation/u1/y.pdf\u0000.txt',
    'graduation/u1/y.pdf%00',
    'baska/u1/y.pdf',
    'graduation/u1/y/z.pdf',
    `graduation/${'a'.repeat(65)}/y.pdf`,
  ])('geçersiz: %j', (key) => {
    expect(isValidStorageKey(key)).toBe(false);
  });

  it('yeni belge anahtarı biçimi ve benzersizliği; geçersiz kullanıcı kimliği reddedilir', () => {
    const a = newGraduationDocumentKey('user-1');
    const b = newGraduationDocumentKey('user-1');
    expect(a).toMatch(/^graduation\/user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(a).not.toBe(b);
    expect(() => newGraduationDocumentKey('../x')).toThrow(TypeError);
    expect(() => newGraduationDocumentKey('a/b')).toThrow(TypeError);
  });
});

/** Her sürücünün uyması gereken ORTAK sözleşme. */
function contract(
  name: string,
  make: () => Promise<{ storage: StorageAdapter; cleanup?: () => Promise<void> }>,
) {
  describe(`${name}: StorageAdapter sözleşmesi`, () => {
    let storage: StorageAdapter;
    let cleanup: (() => Promise<void>) | undefined;
    beforeEach(async () => {
      ({ storage, cleanup } = await make());
    });
    afterEach(async () => {
      await cleanup?.();
    });

    it('yazdığını aynen okur; üzerine yazar', async () => {
      await storage.put('graduation/u1/a.pdf', bytes('%PDF-bir'), meta);
      expect(
        new TextDecoder().decode((await storage.get('graduation/u1/a.pdf')) ?? new Uint8Array()),
      ).toBe('%PDF-bir');
      await storage.put('graduation/u1/a.pdf', bytes('%PDF-iki'), meta);
      expect(
        new TextDecoder().decode((await storage.get('graduation/u1/a.pdf')) ?? new Uint8Array()),
      ).toBe('%PDF-iki');
    });

    it('olmayan dosya null; silme idempotent (ikinci silme hata vermez)', async () => {
      expect(await storage.get('graduation/u1/yok.pdf')).toBeNull();
      await storage.put('graduation/u1/b.pdf', bytes('%PDF-x'), meta);
      await storage.delete('graduation/u1/b.pdf');
      await storage.delete('graduation/u1/b.pdf');
      expect(await storage.get('graduation/u1/b.pdf')).toBeNull();
    });

    it('geçersiz anahtarı her işlemde reddeder (yol aşımı yok)', async () => {
      for (const key of [
        '../x.pdf',
        'graduation/../../x.pdf',
        '/etc/passwd',
        'graduation/u1/x.txt',
      ]) {
        await expect(storage.put(key, bytes('x'), meta)).rejects.toThrow(TypeError);
        await expect(storage.get(key)).rejects.toThrow(TypeError);
        await expect(storage.delete(key)).rejects.toThrow(TypeError);
      }
    });

    it('döndürülen bayt dizisini değiştirmek saklanan dosyayı değiştirmez', async () => {
      await storage.put('graduation/u1/c.pdf', bytes('%PDF-orijinal'), meta);
      const read = await storage.get('graduation/u1/c.pdf');
      read?.fill(0);
      expect(
        new TextDecoder().decode((await storage.get('graduation/u1/c.pdf')) ?? new Uint8Array()),
      ).toBe('%PDF-orijinal');
    });
  });
}

contract('bellek (sahte)', async () => ({ storage: createMemoryStorage() }));
contract('yerel dosya', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mezun-depo-'));
  return {
    storage: createLocalStorage(root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
});

describe('yerel sürücüye özgü güvenlik', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mezun-depo-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('dosyalar yalnız sahibi için okunur/yazılır (0600), klasörler 0700', async () => {
    const storage = createLocalStorage(root);
    await storage.put('graduation/u1/a.pdf', bytes('%PDF-x'), meta);
    expect((await stat(path.join(root, 'graduation/u1/a.pdf'))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(root, 'graduation/u1'))).mode & 0o777).toBe(0o700);
  });

  it('yazma atomiktir: geçici dosya kalmaz', async () => {
    const storage = createLocalStorage(root);
    await storage.put('graduation/u1/a.pdf', bytes('%PDF-x'), meta);
    expect(await readdir(path.join(root, 'graduation/u1'))).toEqual(['a.pdf']);
  });

  it('G/Ç hatası StorageError olur; yol ve sistem iletisi hata iletisine girmez', async () => {
    const blocker = path.join(root, 'graduation');
    await writeFile(blocker, 'dosya'); // klasör olması gereken yer dosya: mkdir başarısız
    const storage = createLocalStorage(root);
    const error = await storage.put('graduation/u1/a.pdf', bytes('x'), meta).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect((error as Error).message).toBe('Depolama işlemi başarısız: put');
    expect((error as Error).message).not.toContain(root);
  });
});

describe('bellek sürücüsü hata enjeksiyonu', () => {
  it('failures bayrağı ilgili işlemi StorageError ile düşürür', async () => {
    const storage = createMemoryStorage();
    storage.failures.put = true;
    await expect(storage.put('graduation/u1/a.pdf', bytes('x'), meta)).rejects.toBeInstanceOf(
      StorageError,
    );
    storage.failures.put = false;
    await storage.put('graduation/u1/a.pdf', bytes('x'), meta);
    storage.failures.get = true;
    await expect(storage.get('graduation/u1/a.pdf')).rejects.toBeInstanceOf(StorageError);
    storage.failures.delete = true;
    await expect(storage.delete('graduation/u1/a.pdf')).rejects.toBeInstanceOf(StorageError);
  });
});
