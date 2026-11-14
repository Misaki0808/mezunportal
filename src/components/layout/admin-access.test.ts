import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codedForbidden } from '@/lib/errors';

const guards = vi.hoisted(() => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/server/permissions', () => ({
  ...guards,
  requireUserWithoutConsent: guards.requireUser,
  requirePageUserWithoutConsent: guards.requireUser,
  requirePageAdmin: guards.requireAdmin,
}));

import { hasAdminAccess, hasAdminAccessStrict } from './admin-access';

describe('hasAdminAccess', () => {
  beforeEach(() => {
    guards.requireUser.mockReset();
    guards.requireAdmin.mockReset();
  });
  it('oturumdaki Next kontrol sinyalini yutmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    guards.requireUser.mockRejectedValue(signal);
    await expect(hasAdminAccess()).rejects.toBe(signal);
  });
  it('yönetim korumasındaki Next kontrol sinyalini yutmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    guards.requireUser.mockResolvedValue({ facts: { grants: [{ scope: 'SYSTEM' }] } });
    guards.requireAdmin.mockRejectedValue(signal);
    await expect(hasAdminAccess()).rejects.toBe(signal);
  });
  it('oturum yoksa yönetime erişimi göstermez', async () => {
    guards.requireUser.mockRejectedValue(new Error('no session'));
    expect(await hasAdminAccess()).toBe(false);
    expect(guards.requireAdmin).not.toHaveBeenCalled();
  });
  it('yönetici yetkisi sunucu korumasından geçmeden bağlantıyı göstermez', async () => {
    guards.requireUser.mockResolvedValue({
      facts: { grants: [{ scope: 'DEPARTMENT', departmentId: 'd' }] },
    });
    guards.requireAdmin.mockRejectedValue(new Error('forbidden'));
    expect(await hasAdminAccess()).toBe(false);
    expect(guards.requireAdmin).toHaveBeenCalledWith({ kind: 'DEPARTMENT', departmentId: 'd' });
  });
  it('kapsamı sunucuda onaylanan yöneticiye bağlantıyı gösterir', async () => {
    guards.requireUser.mockResolvedValue({
      facts: { grants: [{ scope: 'FACULTY', facultyId: 'f' }] },
    });
    guards.requireAdmin.mockResolvedValue({});
    expect(await hasAdminAccess()).toBe(true);
    expect(guards.requireAdmin).toHaveBeenCalledWith({ kind: 'FACULTY', facultyId: 'f' });
  });
  it('rolü doğrulanmış yöneticinin eksik rızasını rol reddine çevirmez', async () => {
    guards.requireUser.mockResolvedValue({ facts: { grants: [{ scope: 'SYSTEM' }] } });
    guards.requireAdmin.mockRejectedValue(codedForbidden('CONSENT_REQUIRED'));
    expect(await hasAdminAccess()).toBe(true);
    expect(guards.requireAdmin).toHaveBeenCalledWith({ kind: 'SYSTEM' });
  });
});

it('sayfa kontrolü oturum altyapı hatasını yutmaz; gezinme görünürlüğü eski fail-closed durumda kalır', async () => {
  const error = new Error('private');
  guards.requireUser.mockRejectedValue(error);
  await expect(hasAdminAccessStrict()).rejects.toBe(error);
  expect(await hasAdminAccess()).toBe(false);
});
it('sayfa kontrolü yönetici kapsamı altyapı hatasını yutmaz', async () => {
  const error = new Error('private');
  guards.requireUser.mockResolvedValue({ facts: { grants: [{ scope: 'SYSTEM' }] } });
  guards.requireAdmin.mockRejectedValue(error);
  await expect(hasAdminAccessStrict()).rejects.toBe(error);
});
