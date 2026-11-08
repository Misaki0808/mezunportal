import { beforeEach, expect, it, vi } from 'vitest';
import { codedForbidden, codedUnauthenticated } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), consent: vi.fn(), db: vi.fn() }));
vi.mock('@/server/permissions', () => ({ requireAnyAdmin: mocks.admin }));
vi.mock('@/server/services/privacy', () => ({ requireConsent: mocks.consent }));
vi.mock('@/server/db', () => ({ getDb: mocks.db }));
import { metricsAccess } from './access';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ userId: 'session-admin' });
  mocks.db.mockReturnValue({ marker: 'db' });
  mocks.consent.mockResolvedValue(undefined);
});
it('inceleyici: rızalı yöneticide oturum kimliğiyle onay denetlenir', async () => {
  expect(await metricsAccess()).toEqual({ ok: true, data: null });
  expect(mocks.consent).toHaveBeenCalledWith({ marker: 'db' }, 'session-admin');
});
it('inceleyici: rızasız yönetici kapıdan geçemez', async () => {
  mocks.consent.mockRejectedValue(codedForbidden('CONSENT_REQUIRED'));
  expect(await metricsAccess()).toEqual({ ok: false, errorCode: 'CONSENT_REQUIRED' });
});
it('inceleyici: oturumsuz/yetkisiz istekte veri veya rıza sorgusu yok', async () => {
  for (const error of [
    codedUnauthenticated('AUTH_UNAUTHENTICATED'),
    codedForbidden('AUTH_FORBIDDEN'),
  ]) {
    mocks.admin.mockRejectedValue(error);
    expect(await metricsAccess()).toMatchObject({ ok: false });
  }
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.consent).not.toHaveBeenCalled();
});
