import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    await expect(failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'))).rejects.toMatchObject({
      digest: expect.stringContaining('/giris?donus=%2Fdeneyim%2Fyeni'),
    });
  });

  it('güvenli olmayan ya da boş yolda düz /giris', async () => {
    withPath('//kotu.example');
    await expect(failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'))).rejects.toMatchObject({
      digest: expect.stringMatching(/;\/giris;/),
    });
    withPath(null);
    await expect(failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'))).rejects.toMatchObject({
      digest: expect.stringMatching(/;\/giris;/),
    });
  });

  it('diğer hata kodları yönlendirmez; hata değer olarak döner', async () => {
    withPath('/deneyim/yeni');
    await expect(failAction(codedForbidden('AUTH_FORBIDDEN'))).resolves.toEqual({
      ok: false,
      errorCode: 'AUTH_FORBIDDEN',
    });
    await expect(failAction(codedConflict('RESOURCE_CONFLICT'))).resolves.toMatchObject({
      errorCode: 'RESOURCE_CONFLICT',
    });
    await expect(failAction(new Error('postgres://gizli'))).resolves.toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });

  it('istek kapsamı yoksa (başlıklar okunamaz) yönlendirme yapılmaz, hata değer olarak döner', async () => {
    mocks.headers.mockImplementation(() => {
      throw new Error('request scope yok');
    });
    await expect(failAction(codedUnauthenticated('AUTH_UNAUTHENTICATED'))).resolves.toEqual({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
  });
});
