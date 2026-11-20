import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isValidStorageKey, newCvKey, newGraduationDocumentKey } from './keys';
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

  it('yeni CV anahtarı cv/<kullanıcı>/<uuid>.pdf biçimindedir; benzersizdir; geçersiz kimlik reddedilir', () => {
    const a = newCvKey('user-1');
    expect(a).toMatch(/^cv\/user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(isValidStorageKey(a)).toBe(true);
    expect(newCvKey('user-1')).not.toBe(a);
    expect(() => newCvKey('../x')).toThrow(TypeError);
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

  it.each(['cv', 'graduation'] as const)(
    '%s listesi yalnız normal eski PDF sayar; eski yarım yazımları siler, sınır ve yeni yazımlar kalır',
    async (kind) => {
      const storage = createLocalStorage(root);
      const now = new Date('2030-01-01T12:00:00Z');
      const before = new Date(now.getTime() - 60 * 60 * 1000);
      const old = new Date(before.getTime() - 1);
      const user = path.join(root, kind, 'user');
      const outside = path.join(root, 'outside');
      await mkdir(user, { recursive: true });
      await mkdir(outside);
      const target = path.join(outside, 'target.pdf');
      await writeFile(target, 'korunur');
      await utimes(target, old, old);
      const names = [
        'old.pdf',
        'boundary.pdf',
        'new.pdf',
        'future.pdf',
        'old.pdf.012345abcdef.tmp',
        'boundary.pdf.012345abcdef.tmp',
        'new.pdf.012345abcdef.tmp',
        'future.pdf.012345abcdef.tmp',
        'unknown.tmp',
        'bad.txt.012345abcdef.tmp',
        'old.pdf.bad.tmp',
      ];
      for (const name of names) {
        const file = path.join(user, name);
        await writeFile(file, 'x');
        const age = name.startsWith('boundary')
          ? before
          : name.startsWith('new')
            ? now
            : name.startsWith('future')
              ? new Date(now.getTime() + 3600000)
              : old;
        await utimes(file, age, age);
      }
      for (const name of ['directory.pdf', 'directory.pdf.012345abcdef.tmp']) {
        await mkdir(path.join(user, name));
        await utimes(path.join(user, name), old, old);
      }
      for (const name of ['link.pdf', 'link.pdf.012345abcdef.tmp'])
        await symlink(target, path.join(user, name));
      await symlink(outside, path.join(root, kind, 'linked-user'));
      const list = kind === 'cv' ? storage.listOldCvKeys! : storage.listOldGraduationKeys!;
      expect(await list(before)).toEqual([`${kind}/user/old.pdf`]);
      expect(await storage.purgeTemporaryFiles!(before)).toBe(1);
      expect(await storage.purgeTemporaryFiles!(before)).toBe(0);
      expect(await readdir(user)).toEqual(
        expect.arrayContaining(names.filter((name) => !name.startsWith('old.pdf.012'))),
      );
      await expect(lstat(path.join(user, 'old.pdf.012345abcdef.tmp'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await readFile(target, 'utf8')).toBe('korunur');
      expect((await lstat(path.join(user, 'link.pdf.012345abcdef.tmp'))).isSymbolicLink()).toBe(
        true,
      );
      expect((await lstat(path.join(user, 'directory.pdf.012345abcdef.tmp'))).isDirectory()).toBe(
        true,
      );
      // Tür kökü de sembolik bağ olursa dışarıdaki dosyalar aday olamaz.
      await rm(path.join(root, kind), { recursive: true });
      await symlink(outside, path.join(root, kind));
      expect(await list(before)).toEqual([]);
      expect(await storage.purgeTemporaryFiles!(before)).toBe(0);
      expect(await readFile(target, 'utf8')).toBe('korunur');
    },
  );

  it('profil fotoğrafı yarım yazımları: eski .tmp silinir; sınır, yeni, gelecek, geçersiz ad, klasör, sembolik bağ ve asıl fotoğraf kalır', async () => {
    const storage = createLocalStorage(root);
    const now = new Date('2030-01-01T12:00:00Z');
    const before = new Date(now.getTime() - 60 * 60 * 1000);
    const old = new Date(before.getTime() - 1);
    const user = path.join(root, 'photo', 'user');
    const outside = path.join(root, 'outside');
    await mkdir(user, { recursive: true });
    await mkdir(outside);
    const id = (n: number) => `0000000${n}-89ab-cdef-0123-456789abcdef`;
    const hex = '012345abcdef';
    const files: [string, Date][] = [
      [`${id(1)}-512.webp.${hex}.tmp`, old], // silinir
      [`${id(1)}-96.webp.${hex}.tmp`, old], // silinir
      [`${id(2)}-512.webp.${hex}.tmp`, before], // tam sınır: kalır
      [`${id(3)}-512.webp.${hex}.tmp`, now], // yazım sürüyor: kalır
      [`${id(4)}-512.webp.${hex}.tmp`, new Date(now.getTime() + 3600000)], // gelecekte: kalır
      [`${id(5)}-1024.webp.${hex}.tmp`, old], // geçersiz boyut: kalır
      [`${id(5)}-512.png.${hex}.tmp`, old], // geçersiz uzantı: kalır
      [`kisa-512.webp.${hex}.tmp`, old], // kimlik biçimi uymuyor: kalır
      [`${id(6)}-512.webp.bad.tmp`, old], // hex biçimi uymuyor: kalır
      [`${id(1)}-512.webp`, old], // asıl fotoğraf: eski olsa da süpürülmez
      [`${id(1)}-96.webp`, old],
    ];
    for (const [name, age] of files) {
      await writeFile(path.join(user, name), 'x');
      await utimes(path.join(user, name), age, age);
    }
    const target = path.join(outside, 'target.webp');
    await writeFile(target, 'korunur');
    await utimes(target, old, old);
    const outsideTemporary = path.join(outside, `${id(1)}-512.webp.${hex}.tmp`);
    await writeFile(outsideTemporary, 'korunur');
    await utimes(outsideTemporary, old, old);
    const directory = `${id(7)}-512.webp.${hex}.tmp`;
    await mkdir(path.join(user, directory));
    await utimes(path.join(user, directory), old, old);
    const link = `${id(8)}-512.webp.${hex}.tmp`;
    await symlink(target, path.join(user, link));
    await symlink(outside, path.join(root, 'photo', 'linked-user'));
    expect(await storage.purgeTemporaryFiles!(before)).toBe(2);
    expect(await storage.purgeTemporaryFiles!(before)).toBe(0);
    for (const gone of [`${id(1)}-512.webp.${hex}.tmp`, `${id(1)}-96.webp.${hex}.tmp`])
      await expect(lstat(path.join(user, gone))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(user)).sort()).toEqual(
      [
        ...files
          .map(([name]) => name)
          .filter(
            (name) =>
              name !== `${id(1)}-512.webp.${hex}.tmp` && name !== `${id(1)}-96.webp.${hex}.tmp`,
          ),
        directory,
        link,
      ].sort(),
    );
    expect(await readFile(target, 'utf8')).toBe('korunur');
    expect(await readFile(outsideTemporary, 'utf8')).toBe('korunur');
    // Asıl fotoğraflar hiçbir süpürmede aday değildir (yalnız yarım yazımlar).
    expect(await storage.listOldCvKeys!(before)).toEqual([]);
    expect(await storage.listOldGraduationKeys!(before)).toEqual([]);
    // Tür kökü sembolik bağ olursa dışarıdaki dosyalar aday olamaz.
    await rm(path.join(root, 'photo'), { recursive: true });
    await symlink(outside, path.join(root, 'photo'));
    expect(await storage.purgeTemporaryFiles!(before)).toBe(0);
    expect(await readFile(outsideTemporary, 'utf8')).toBe('korunur');
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
