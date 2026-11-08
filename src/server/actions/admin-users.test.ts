import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

// Eylemler ince yapıştırıcıdır: sıra (koruma → doğrulama → servis) ve hata biçimi burada sınanır.
const mocks = vi.hoisted(() => ({
  requireAnyAdmin: vi.fn(),
  requireAdmin: vi.fn(),
  service: {
    suspendUser: vi.fn(),
    unsuspendUser: vi.fn(),
    correctMembership: vi.fn(),
    grantAdmin: vi.fn(),
    revokeAdmin: vi.fn(),
  },
}));

vi.mock('../permissions', () => ({
  requireAnyAdmin: mocks.requireAnyAdmin,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('./deps', () => ({ adminUserDeps: () => ({ marker: 'deps' }) }));
vi.mock('../services/admin-users', () => mocks.service);

import {
  correctMembership,
  grantAdmin,
  revokeAdmin,
  suspendUser,
  unsuspendUser,
} from './admin-users';

const ADMIN = { userId: 'oturum-yoneticisi', facts: {} };

beforeEach(() => {
  mocks.requireAnyAdmin.mockReset().mockResolvedValue(ADMIN);
  mocks.requireAdmin.mockReset().mockResolvedValue(ADMIN);
  for (const fn of Object.values(mocks.service)) fn.mockReset();
});

const anyAdminCalls: [string, () => Promise<unknown>, keyof typeof mocks.service][] = [
  [
    'suspendUser',
    () => suspendUser({ confirmed: true, userId: 'u', reason: 'Kural ihlali' }),
    'suspendUser',
  ],
  [
    'unsuspendUser',
    () => unsuspendUser({ confirmed: true, reason: 'İnceleme tamamlandı', userId: 'u' }),
    'unsuspendUser',
  ],
  [
    'correctMembership',
    () =>
      correctMembership({
        confirmed: true,
        membershipId: 'm',
        reason: 'Yanlış beyan',
        changes: { entryYear: 2022 },
      }),
    'correctMembership',
  ],
];
const systemCalls: [string, () => Promise<unknown>, keyof typeof mocks.service][] = [
  ['grantAdmin', () => grantAdmin({ confirmed: true, scope: 'SYSTEM', userId: 'u' }), 'grantAdmin'],
  [
    'revokeAdmin',
    () => revokeAdmin({ confirmed: true, grantId: 'g', reason: 'Görev bitti' }),
    'revokeAdmin',
  ],
];

describe('koruma her şeyden önce gelir', () => {
  it.each(anyAdminCalls)(
    '%s: kapsamsız kullanıcıda servis çağrılmaz',
    async (_name, call, service) => {
      mocks.requireAnyAdmin.mockRejectedValue(codedForbidden('AUTH_FORBIDDEN'));
      expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
      expect(mocks.service[service]).not.toHaveBeenCalled();
      expect(mocks.requireAdmin).not.toHaveBeenCalled();
    },
  );

  it.each(systemCalls)(
    '%s: sistem yöneticisi olmayanda servis çağrılmaz',
    async (_name, call, service) => {
      mocks.requireAdmin.mockRejectedValue(codedForbidden('AUTH_FORBIDDEN'));
      expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
      expect(mocks.service[service]).not.toHaveBeenCalled();
      expect(mocks.requireAdmin).toHaveBeenCalledWith({ kind: 'SYSTEM' });
      expect(mocks.requireAnyAdmin).not.toHaveBeenCalled();
    },
  );

  it.each([...anyAdminCalls, ...systemCalls])(
    '%s: oturumsuz AUTH_UNAUTHENTICATED',
    async (_name, call) => {
      mocks.requireAnyAdmin.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
      mocks.requireAdmin.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
      expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    },
  );
});

describe('girdi doğrulanır; yönetici kimliği yalnız oturumdan gelir', () => {
  it('geçersiz girdi servise ulaşmaz', async () => {
    expect(await suspendUser({ confirmed: true, userId: 'u', reason: '' })).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
    });
    expect(
      await suspendUser({ confirmed: true, userId: '', reason: 'Kural ihlali' }),
    ).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    expect(
      await suspendUser({
        confirmed: true,
        userId: 'u',
        reason: 'Kural ihlali',
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toMatchObject({ errorCode: 'VALIDATION_INVALID' });
    expect(
      await correctMembership({
        confirmed: true,
        membershipId: 'm',
        reason: 'Yanlış',
        changes: {},
      }),
    ).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    expect(
      await grantAdmin({ confirmed: true, scope: 'FACULTY', userId: 'u' } as never),
    ).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    expect(await revokeAdmin({ confirmed: true, grantId: 'g', reason: 'ab' })).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
  });

  it('istemcinin eklediği yönetici/rol/kapsam alanları reddedilir; servis oturumdaki kimlikle çağrılır', async () => {
    expect(
      await suspendUser({
        confirmed: true,
        userId: 'u',
        reason: 'Kural ihlali',
        adminId: 'baska',
        role: 'ADMIN',
      } as never),
    ).toMatchObject({ errorCode: 'VALIDATION_INVALID' });
    mocks.service.suspendUser.mockResolvedValue({
      userId: 'u',
      status: 'SUSPENDED',
      expiresAt: null,
      sessionsRevoked: 0,
    });
    await suspendUser({ confirmed: true, userId: 'u', reason: 'Kural ihlali' });
    const [deps, adminUserId, input] = mocks.service.suspendUser.mock.calls[0]!;
    expect(deps).toEqual({ marker: 'deps' });
    expect(adminUserId).toBe('oturum-yoneticisi');
    expect(input).toEqual({ userId: 'u', reason: 'Kural ihlali', confirmed: true });
  });
});

describe('sonuç biçimi', () => {
  it('başarı ActionResult olarak sarılır; kodlu hata kararlı kodla döner; beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.service.unsuspendUser.mockResolvedValueOnce({ userId: 'u', status: 'ACTIVE' });
    expect(
      await unsuspendUser({ confirmed: true, reason: 'İnceleme tamamlandı', userId: 'u' }),
    ).toEqual({
      ok: true,
      data: { userId: 'u', status: 'ACTIVE' },
    });
    mocks.service.unsuspendUser.mockRejectedValueOnce(codedForbidden('ADMIN_SELF_ACTION'));
    expect(
      await unsuspendUser({ confirmed: true, reason: 'İnceleme tamamlandı', userId: 'u' }),
    ).toEqual({
      ok: false,
      errorCode: 'ADMIN_SELF_ACTION',
    });
    mocks.service.unsuspendUser.mockRejectedValueOnce(new Error('postgres://gizli@host/db'));
    expect(
      await unsuspendUser({ confirmed: true, reason: 'İnceleme tamamlandı', userId: 'u' }),
    ).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });
});
