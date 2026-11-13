import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { z } from 'zod';

import { codedConflict, codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));

import { failAction, signInPathFor } from './fail-action';

const withPath = (value: string | null) =>
  mocks.headers.mockResolvedValue(new Headers(value === null ? {} : { 'x-mezun-path': value }));
beforeEach(() => {
  mocks.headers.mockReset();
});

describe('signInPathFor (açık yönlendirme yok)', () => {
  it.each([
    ['/deneyim/yeni', '/giris?donus=%2Fdeneyim%2Fyeni'],
    ['/deneyimler?q=staj&page=2', '/giris?donus=%2Fdeneyimler%3Fq%3Dstaj%26page%3D2'],
    [null, '/giris'],
    ['', '/giris'],
    ['/', '/giris'],
    ['https://kotu.example/x', '/giris'],
    ['//kotu.example/x', '/giris'],
    ['/\\kotu.example', '/giris'],
    ['/%2F%2Fkotu.example', '/giris'],
    ['javascript:alert(1)', '/giris'],
    ['/giris?donus=/hesap', '/giris'], // döngü: giriş sayfasına dönüş yok
    ['/onay', '/giris'],
    ['/api/auth/x', '/giris'],
    ['/a\nb', '/giris'],
  ])('%j → %s', (requestPath, expected) => {
    expect(signInPathFor(requestPath)).toBe(expected);
  });
});

describe('failAction', () => {
  it('oturum düşmüşse girişe dönüş yoluyla yönlendirir (hata değeri dönmez)', async () => {
    withPath('/deneyim/yeni');
    await expect(
      failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'), 'testEylemi'),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('/giris?donus=%2Fdeneyim%2Fyeni'),
    });
  });

  it('güvenli olmayan ya da boş yolda düz /giris', async () => {
    withPath('//kotu.example');
    await expect(
      failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'), 'testEylemi'),
    ).rejects.toMatchObject({
      digest: expect.stringMatching(/;\/giris;/),
    });
    withPath(null);
    await expect(
      failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'), 'testEylemi'),
    ).rejects.toMatchObject({
      digest: expect.stringMatching(/;\/giris;/),
    });
  });

  it('diğer hata kodları yönlendirmez; hata değer olarak döner', async () => {
    withPath('/deneyim/yeni');
    await expect(failAction(codedForbidden('AUTH_FORBIDDEN'), 'testEylemi')).resolves.toEqual({
      ok: false,
      errorCode: 'AUTH_FORBIDDEN',
    });
    await expect(
      failAction(codedConflict('RESOURCE_CONFLICT'), 'testEylemi'),
    ).resolves.toMatchObject({
      errorCode: 'RESOURCE_CONFLICT',
    });
    await expect(failAction(new Error('postgres://gizli'), 'testEylemi')).resolves.toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });

  it('istek kapsamı yoksa (başlıklar okunamaz) yönlendirme yapılmaz, hata değer olarak döner', async () => {
    mocks.headers.mockImplementation(() => {
      throw new Error('request scope yok');
    });
    await expect(
      failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'), 'testEylemi'),
    ).resolves.toEqual({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
  });
});

describe('bekçi: sunucu eylemleri ortak hata çıkışını kullanır', () => {
  it('src/server/actions içinde actionFailure çağrılmaz (oturumsuz dönüş yolu atlanırdı)', () => {
    const dir = join(__dirname, 'actions');
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .filter((name) => /\bactionFailure\b/.test(readFileSync(join(dir, name), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('beklenmedik hata günlüğü (action.unexpected)', () => {
  afterEach(() => vi.restoreAllMocks());
  const stderr = () => vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const line = (write: ReturnType<typeof stderr>) =>
    JSON.parse(String(write.mock.calls[0]![0]).trim());

  it('kodsuz hata: SERVER_UNEXPECTED döner ve eylem adı + hata sınıfı + kodla TEK satır yazılır; ileti ve yığın yok', async () => {
    const write = stderr();
    mocks.headers.mockResolvedValue(
      new Headers({ 'x-request-id': 'req-77', 'next-action': '40' + 'cd'.repeat(20) }),
    );
    const error = Object.assign(new Error('ayse@ogr.iu.edu.tr postgres://gizli'), {
      code: 'P2034',
    });
    await expect(failAction(error, 'saveConsents')).resolves.toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(line(write)).toEqual({
      event: 'action.unexpected',
      source: 'saveConsents',
      errorName: 'Error',
      errorCode: 'P2034',
      requestId: 'req-77',
      actionId: '40' + 'cd'.repeat(20),
    });
    expect(String(write.mock.calls[0]![0])).not.toMatch(/ayse|postgres|gizli/);
  });

  it('istek kapsamı yoksa (başlıklar okunamaz) yine tek satır yazılır, kimlik alanları olmaz', async () => {
    const write = stderr();
    mocks.headers.mockImplementation(() => {
      throw new Error('request scope yok');
    });
    await failAction(new TypeError('x'), 'getMyInbox');
    expect(write).toHaveBeenCalledTimes(1);
    expect(line(write)).toEqual({
      event: 'action.unexpected',
      source: 'getMyInbox',
      errorName: 'TypeError',
    });
  });

  it('kodlu hatalar sessiz kalır (yetki, bulunamadı, çakışma): günlük gürültüsü yok', async () => {
    const write = stderr();
    withPath('/deneyim/yeni');
    await failAction(codedForbidden('AUTH_FORBIDDEN'), 'x');
    await failAction(codedConflict('RESOURCE_CONFLICT'), 'x');
    expect(write).not.toHaveBeenCalled();
  });

  it('oturum düşmesi (yönlendirme) beklenmedik hata sayılmaz', async () => {
    const write = stderr();
    withPath('/deneyim/yeni');
    await expect(
      failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'), 'x'),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('doğrulama hatası (Zod) günlüğe düşmez', async () => {
    const write = stderr();
    const zod = z.object({ a: z.string() }).safeParse({}).error!;
    await expect(failAction(zod, 'x')).resolves.toMatchObject({ errorCode: 'VALIDATION_INVALID' });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('bekçi: her failAction çağrısı eylemini adlandırır', () => {
  it("src/server/actions içindeki her failAction(error, 'ad') ikinci bağımsız değişken olarak sabit bir ad taşır", () => {
    const dir = join(__dirname, 'actions');
    const eksik: string[] = [];
    let toplam = 0;
    for (const name of readdirSync(dir).filter(
      (n) => n.endsWith('.ts') && !n.endsWith('.test.ts'),
    )) {
      const text = readFileSync(join(dir, name), 'utf8');
      const calls = text.match(/failAction\([^)]*\)/g) ?? [];
      for (const call of calls) {
        toplam++;
        if (!/^failAction\(\w+, '[A-Za-z0-9_.:-]{1,64}'\)$/.test(call))
          eksik.push(`${name}: ${call}`);
      }
    }
    expect(toplam).toBeGreaterThan(150);
    expect(eksik).toEqual([]);
  });

  it('ad, çağrının içinde bulunduğu işlevin adıdır (yanlış etiket günlüğü yanıltmaz)', () => {
    const dir = join(__dirname, 'actions');
    const yanlis: string[] = [];
    for (const name of readdirSync(dir).filter(
      (n) => n.endsWith('.ts') && !n.endsWith('.test.ts'),
    )) {
      let current = '';
      for (const row of readFileSync(join(dir, name), 'utf8').split('\n')) {
        const fn = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(row);
        if (fn) current = fn[1]!;
        const call = /failAction\(\w+, '([^']+)'\)/.exec(row);
        if (call && call[1] !== current) yanlis.push(`${name}: ${call[1]} ≠ ${current}`);
      }
    }
    expect(yanlis).toEqual([]);
  });
});
