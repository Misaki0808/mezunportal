import { redirect } from 'next/navigation';
import { codedForbidden } from '@/lib/errors';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ has: vi.fn(), overview: vi.fn() }));
vi.mock('@/components/layout/admin-access', () => ({ hasAdminAccessStrict: mocks.has }));
vi.mock('@/server/actions/admin', () => ({ getAdminOverview: mocks.overview }));
import { adminAccess } from './access';
const capabilities = {
  users: true,
  reports: true,
  employmentReport: true,
  dictionaries: false,
  unmatchedValues: false,
  adminGrants: false,
  auditLog: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.has.mockResolvedValue(true);
  mocks.overview.mockResolvedValue({ ok: true, data: { capabilities } });
});
it('inceleyici: yönetici olmayan için panel sorgusu çalışmaz', async () => {
  mocks.has.mockResolvedValue(false);
  expect(await adminAccess('users')).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  expect(mocks.overview).not.toHaveBeenCalled();
});
it.each(['dictionaries', 'unmatchedValues', 'adminGrants', 'auditLog'] as const)(
  'inceleyici: kapsam yöneticisi %s menüsünü doğrudan açamaz',
  async (capability) => {
    expect(await adminAccess(capability)).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  },
);
it('inceleyici: izinli sayfa ve servis hataları kararlı sonucu korur', async () => {
  expect(await adminAccess('users')).toMatchObject({ ok: true });
  mocks.overview.mockResolvedValueOnce({ ok: false, errorCode: 'AUTH_ACCOUNT_SUSPENDED' });
  expect(await adminAccess('users')).toEqual({ ok: false, errorCode: 'AUTH_ACCOUNT_SUSPENDED' });
  mocks.overview.mockRejectedValueOnce(new Error('private detail'));
  expect(await adminAccess('users')).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
});

it('eksik rıza veri kapısından gelir ve rol reddine dönüştürülmez', async () => {
  mocks.overview.mockResolvedValue({ ok: false, errorCode: 'CONSENT_REQUIRED' });
  expect(await adminAccess('users')).toEqual({ ok: false, errorCode: 'CONSENT_REQUIRED' });
});

it('yönetim kapısında kodsuz arıza tek güvenli günlükle genel hata verir, özet sorgulamaz', async () => {
  mocks.has.mockRejectedValue(new Error('ayse@example.test private'));
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    expect(await adminAccess('users')).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();
    expect(String(write.mock.calls[0]![0])).not.toMatch(/ayse|private/);
  } finally {
    write.mockRestore();
  }
});
it('yönetim kapısında kodlu ret sessizdir, Next sinyali yeniden fırlatılır', async () => {
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    mocks.has.mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    expect(await adminAccess('users')).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    let signal: unknown;
    try {
      redirect('/giris');
    } catch (error) {
      signal = error;
    }
    mocks.has.mockRejectedValueOnce(signal);
    await expect(adminAccess('users')).rejects.toBe(signal);
    expect(write).not.toHaveBeenCalled();
    expect(mocks.overview).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
