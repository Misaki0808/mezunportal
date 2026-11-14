import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), access: vi.fn(), metrics: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/components/admin/access', () => ({ adminAccess: mocks.access }));
vi.mock('@/components/metrics/access', () => ({ metricsAccess: mocks.metrics }));

import AdminNotFound from './not-found';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';

const at = (path: string) =>
  mocks.headers.mockResolvedValue(new Headers({ [REQUEST_PATH_HEADER]: path }));
const shown = async () =>
  ((await AdminNotFound()) as { props: { errorCode: string } }).props.errorCode;

beforeEach(() => {
  vi.clearAllMocks();
  at('/yonetim');
  mocks.access.mockResolvedValue({ ok: true, overview: {} });
  mocks.metrics.mockResolvedValue({ ok: true, data: null });
});

it('yetkili yöneticinin açtığı yabancı ya da olmayan kayıt "bulunamadı" der', async () => {
  at('/yonetim/kullanicilar/018f0000-0000-7000-8000-000000000000');
  expect(await shown()).toBe('RESOURCE_NOT_FOUND');
  expect(mocks.access).toHaveBeenCalledWith('users');
});

it('yabancı ve olmayan kayıt aynı ekranı alır; kayıt hiç sorgulanmaz', async () => {
  at('/yonetim/kullanicilar/yabanci');
  const foreign = await AdminNotFound();
  at('/yonetim/kullanicilar/olmayan');
  const missing = await AdminNotFound();
  expect(foreign).toEqual(missing);
  expect(mocks.access).toHaveBeenCalledTimes(2);
});

it('yöneticisi olmayan kullanıcıya rol uyarısı gösterir', async () => {
  at('/yonetim/kullanicilar/baska');
  mocks.access.mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  expect(await shown()).toBe('AUTH_FORBIDDEN');
});

it('yeteneği olmayan yöneticiye o yolun rol uyarısını gösterir', async () => {
  at('/yonetim/davetler');
  mocks.access.mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  expect(await shown()).toBe('AUTH_FORBIDDEN');
  expect(mocks.access).toHaveBeenCalledWith('dictionaries');
});

it('kullanım raporunda yetkiyi rapor kapısıyla denetler', async () => {
  at('/yonetim/kullanim');
  mocks.metrics.mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  expect(await shown()).toBe('AUTH_FORBIDDEN');
  expect(mocks.access).not.toHaveBeenCalled();
});

it('yetki denetimi hata verirse güvenli tarafta kalır: rol uyarısı', async () => {
  at('/yonetim/kullanicilar/x');
  mocks.access.mockRejectedValue(new Error('db'));
  expect(await shown()).toBe('AUTH_FORBIDDEN');
  mocks.access.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  expect(await shown()).toBe('AUTH_FORBIDDEN');
});

it('yol başlığı yoksa panel yolu sayılır', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  expect(await shown()).toBe('RESOURCE_NOT_FOUND');
  expect(mocks.access).toHaveBeenCalledWith('users');
});
