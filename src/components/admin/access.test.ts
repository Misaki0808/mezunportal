import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ has: vi.fn(), overview: vi.fn() }));
vi.mock('@/components/layout/admin-access', () => ({ hasAdminAccess: mocks.has }));
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
