import { beforeEach, expect, it, vi } from 'vitest';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), view: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/server/actions/feedback', () => ({ getFeedbackView: mocks.view }));

import Layout from './layout';

const at = (path: string) => new Headers({ [REQUEST_PATH_HEADER]: path });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(at('/hesap/gorusme/meeting'));
  mocks.view.mockResolvedValue({ ok: true, data: {} });
});

it('inceleyici: başka katılımcının ya da olmayan görüşme formu loading sınırının üstünde gerçek 404 olur', async () => {
  for (const errorCode of ['RESOURCE_NOT_FOUND', 'AUTH_FORBIDDEN']) {
    mocks.view.mockResolvedValue({ ok: false, errorCode });
    await expect(Layout({ children: 'form' })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  }
});

it('inceleyici: bozuk kodlanmış randevu kimliği servise gitmeden 404 olur', async () => {
  mocks.headers.mockResolvedValue(at('/hesap/gorusme/%E0%A4%A'));
  await expect(Layout({ children: 'form' })).rejects.toMatchObject({
    digest: expect.stringContaining('404'),
  });
  expect(mocks.view).not.toHaveBeenCalled();
});

it('inceleyici: katılımcı, oturumsuz/onaysız ya da zamanlama hatası 404 yapmaz; içerik hesap layout kapısına kalır', async () => {
  expect(await Layout({ children: 'form' })).toBe('form');
  for (const errorCode of ['AUTH_REQUIRED', 'CONSENT_REQUIRED', 'FEEDBACK_NOT_READY']) {
    mocks.view.mockResolvedValue({ ok: false, errorCode });
    expect(await Layout({ children: 'form' })).toBe('form');
  }
});

it('inceleyici: form dışı adresler servise hiç sorulmaz', async () => {
  for (const path of ['/hesap', '/hesap/gorusme', '/hesap/gorusme/a/b', '/giris', '']) {
    mocks.headers.mockResolvedValue(at(path));
    expect(await Layout({ children: 'sayfa' })).toBe('sayfa');
  }
  mocks.headers.mockResolvedValue(new Headers());
  expect(await Layout({ children: 'sayfa' })).toBe('sayfa');
  expect(mocks.view).not.toHaveBeenCalled();
});
