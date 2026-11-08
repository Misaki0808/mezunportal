import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  privacy: vi.fn(),
  headers: vi.fn(),
  access: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('@/components/privacy/server-guard', () => ({ PrivacyGuard: mocks.privacy }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/components/admin/access', () => ({ adminAccess: mocks.access }));
vi.mock('@/server/actions/admin-users', () => ({ getUserDetail: mocks.detail }));
import AdminLayout from './layout';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.privacy.mockImplementation(async ({ children }) => children);
  mocks.headers.mockResolvedValue(new Headers({ [REQUEST_PATH_HEADER]: '/yonetim' }));
  mocks.access.mockResolvedValue({ ok: true, overview: {} });
  mocks.detail.mockResolvedValue({ ok: true, data: {} });
});
it.each([
  ['sozlukler', 'dictionaries'],
  ['eslesmeyenler', 'unmatchedValues'],
  ['yetkiler', 'adminGrants'],
  ['islem-kaydi', 'auditLog'],
] as const)('inceleyici: %s izni loading başlamadan reddedilir', async (path, capability) => {
  mocks.headers.mockResolvedValue(new Headers({ [REQUEST_PATH_HEADER]: '/yonetim/' + path }));
  mocks.access.mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  await expect(AdminLayout({ children: 'content' })).rejects.toMatchObject({
    digest: expect.stringContaining('404'),
  });
  expect(mocks.access).toHaveBeenCalledWith(capability);
});
it('inceleyici: oturum/onay kapısının yanıtı izinden önce korunur', async () => {
  mocks.privacy.mockResolvedValue('consent screen');
  expect(await AdminLayout({ children: 'content' })).toBe('consent screen');
  expect(mocks.access).not.toHaveBeenCalled();
});
it('inceleyici: normal panel izinliyse içeriği aynen döner', async () => {
  expect(await AdminLayout({ children: 'content' })).toBe('content');
  expect(mocks.access).toHaveBeenCalledWith('users');
  expect(mocks.detail).not.toHaveBeenCalled();
});
it('inceleyici: kapsam dışı hedef ayrıntısı yanıt başlamadan 404 olur', async () => {
  mocks.headers.mockResolvedValue(
    new Headers({ [REQUEST_PATH_HEADER]: '/yonetim/kullanicilar/target' }),
  );
  mocks.detail.mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  await expect(AdminLayout({ children: 'content' })).rejects.toMatchObject({
    digest: expect.stringContaining('404'),
  });
  expect(mocks.detail).toHaveBeenCalledWith({ userId: 'target' });
});
it('inceleyici: bozuk kodlanmış hedef 500 üretmeden 404 olur', async () => {
  mocks.headers.mockResolvedValue(
    new Headers({ [REQUEST_PATH_HEADER]: '/yonetim/kullanicilar/%ZZ' }),
  );
  await expect(AdminLayout({ children: 'content' })).rejects.toMatchObject({
    digest: expect.stringContaining('404'),
  });
  expect(mocks.detail).not.toHaveBeenCalled();
});
it('inceleyici: yetki servisi arızası içeriğe izin vermez', async () => {
  mocks.access.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  const result = await AdminLayout({ children: 'content' });
  expect(result).toMatchObject({ props: { errorCode: 'SERVER_UNEXPECTED' } });
});
