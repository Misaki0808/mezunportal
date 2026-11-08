import { beforeEach, expect, it, vi } from 'vitest';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
const mocks = vi.hoisted(() => ({ privacy: vi.fn(), headers: vi.fn(), view: vi.fn() }));
vi.mock('@/components/privacy/server-guard', () => ({ PrivacyGuard: mocks.privacy }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/server/actions/feedback', () => ({ getFeedbackView: mocks.view }));
import Layout from './layout';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.privacy.mockImplementation(async ({ children }) => children);
  mocks.headers.mockResolvedValue(new Headers({ [REQUEST_PATH_HEADER]: '/hesap/gorusme/meeting' }));
  mocks.view.mockResolvedValue({ ok: true, data: {} });
});
it('inceleyici: başka katılımcının formu loading başlamadan 404 olur', async () => {
  mocks.view.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
  await expect(Layout({ children: 'form' })).rejects.toMatchObject({
    digest: expect.stringContaining('404'),
  });
});
it('inceleyici: oturum/onay kapısı ve normal hesap sayfası korunur', async () => {
  mocks.privacy.mockResolvedValueOnce('consent');
  expect(await Layout({ children: 'form' })).toBe('consent');
  expect(mocks.view).not.toHaveBeenCalled();
  mocks.headers.mockResolvedValueOnce(new Headers({ [REQUEST_PATH_HEADER]: '/hesap' }));
  expect(await Layout({ children: 'account' })).toBe('account');
  expect(mocks.view).not.toHaveBeenCalled();
});
it('inceleyici: izinli form geçer, zaman/sunucu hatası içerik yerine kararlı hata döner', async () => {
  expect(await Layout({ children: 'form' })).toBe('form');
  mocks.view.mockResolvedValue({ ok: false, errorCode: 'FEEDBACK_NOT_READY' });
  expect(await Layout({ children: 'form' })).toMatchObject({
    props: { errorCode: 'FEEDBACK_NOT_READY' },
  });
});
