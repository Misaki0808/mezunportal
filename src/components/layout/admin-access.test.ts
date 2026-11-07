import { beforeEach, describe, expect, it, vi } from 'vitest';

const guards = vi.hoisted(() => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/server/permissions', () => guards);

import { hasAdminAccess } from './admin-access';

describe('hasAdminAccess', () => {
  beforeEach(() => {
    guards.requireUser.mockReset();
    guards.requireAdmin.mockReset();
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
});
