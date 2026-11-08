import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedConflict, codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireVerifiedMember: vi.fn(),
  requireConsent: vi.fn(),
  enqueue: vi.fn(),
  points: {
    getMyContribution: vi.fn(),
  },
  admin: {
    listPointRules: vi.fn(),
    updatePointRule: vi.fn(),
    listPointEntries: vi.fn(),
    revokePointEntry: vi.fn(),
    listSuspicionFlags: vi.fn(),
    decideSuspicion: vi.fn(),
    requestPointBackfill: vi.fn(),
  },
}));
vi.mock('../permissions', () => ({
  requireAdmin: mocks.requireAdmin,
  requireVerifiedMember: mocks.requireVerifiedMember,
}));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../jobs/points', () => ({ enqueuePointBackfill: mocks.enqueue }));
vi.mock('../services/privacy', () => ({ requireConsent: mocks.requireConsent }));
vi.mock('../services/points', () => mocks.points);
vi.mock('../services/points-admin', () => mocks.admin);

import {
  decideSuspicion,
  getMyContribution,
  listPointEntries,
  listPointRules,
  listSuspicionFlags,
  requestPointBackfill,
  revokePointEntry,
  updatePointRule,
} from './points';

const SYSTEM = { userId: 'oturum-yoneticisi', facts: {} };
beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue(SYSTEM);
  mocks.requireVerifiedMember.mockReset().mockResolvedValue({ userId: 'oturum-uyesi', facts: {} });
  mocks.requireConsent.mockReset().mockResolvedValue(undefined);
  for (const fn of [...Object.values(mocks.points), ...Object.values(mocks.admin)])
    fn.mockReset().mockResolvedValue({ sonuc: 1 });
});

describe('katkı puanı eylemi (yalnız sahibi)', () => {
  it('kimlik oturumdan gelir; rıza denetlenir; girdideki kullanıcı alanı reddedilir', async () => {
    expect(await getMyContribution({})).toEqual({ ok: true, data: { sonuc: 1 } });
    const args = mocks.points.getMyContribution.mock.calls[0]!;
    expect(args[1]).toBe('oturum-uyesi');
    expect(mocks.requireConsent).toHaveBeenCalledWith({ marker: 'db' }, 'oturum-uyesi');
    mocks.points.getMyContribution.mockClear();
    expect(await getMyContribution({ userId: 'baska' } as never)).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
    });
    expect(mocks.points.getMyContribution).not.toHaveBeenCalled();
  });

  it('oturumsuz ya da rızasız çağrıda servis çağrılmaz', async () => {
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await getMyContribution({})).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    mocks.requireConsent.mockRejectedValueOnce(codedForbidden('CONSENT_REQUIRED'));
    expect(await getMyContribution({})).toEqual({ ok: false, errorCode: 'CONSENT_REQUIRED' });
    expect(mocks.points.getMyContribution).not.toHaveBeenCalled();
  });
});

describe('yönetici eylemleri (yalnız sistem yöneticisi)', () => {
  const calls = [
    ['listPointRules', () => listPointRules(), mocks.admin.listPointRules],
    [
      'updatePointRule',
      () =>
        updatePointRule({
          action: 'SESSION_ONLINE',
          points: 10,
          delayDays: 0,
          isActive: true,
          reason: 'Ayar',
        }),
      mocks.admin.updatePointRule,
    ],
    ['listPointEntries', () => listPointEntries({ userId: 'u1' }), mocks.admin.listPointEntries],
    [
      'revokePointEntry',
      () => revokePointEntry({ entryId: 'e1', reason: 'Hata' }),
      mocks.admin.revokePointEntry,
    ],
    ['listSuspicionFlags', () => listSuspicionFlags({}), mocks.admin.listSuspicionFlags],
    [
      'decideSuspicion',
      () => decideSuspicion({ flagId: 'f1', decision: 'DISMISS', reason: 'Temiz' }),
      mocks.admin.decideSuspicion,
    ],
    ['requestPointBackfill', () => requestPointBackfill({}), mocks.admin.requestPointBackfill],
  ] as const;

  it.each(calls)(
    '%s: SİSTEM kapsamı istenir, kimlik oturumdan gelir',
    async (_name, call, service) => {
      expect(await call()).toEqual({ ok: true, data: { sonuc: 1 } });
      expect(mocks.requireAdmin).toHaveBeenCalledWith({ kind: 'SYSTEM' });
      expect(service.mock.calls[0]![1]).toBe('oturum-yoneticisi');
    },
  );

  it.each(calls)('%s: yetkisizde servis çağrılmaz', async (_name, call, service) => {
    mocks.requireAdmin.mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    expect(service).not.toHaveBeenCalled();
  });

  it('geçersiz girdi (bilinmeyen eylem, aralık dışı puan, eksik gerekçe) servise ulaşmaz', async () => {
    const base = {
      action: 'SESSION_ONLINE',
      points: 10,
      delayDays: 0,
      isActive: true,
      reason: 'Ayar',
    };
    for (const bad of [
      { ...base, action: 'HEDİYE' },
      { ...base, points: 500 },
      { ...base, reason: '' },
      { ...base, ekstra: 1 },
    ]) {
      expect(await updatePointRule(bad as never)).toMatchObject({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
      });
    }
    expect(
      await decideSuspicion({ flagId: 'f', decision: 'BELKİ', reason: 'xyz' } as never),
    ).toMatchObject({
      ok: false,
    });
    expect(mocks.admin.updatePointRule).not.toHaveBeenCalled();
    expect(mocks.admin.decideSuspicion).not.toHaveBeenCalled();
  });

  it('geriye dönük hesaplama kuyruğa yazan bağımlılıkla çağrılır', async () => {
    await requestPointBackfill();
    expect(mocks.admin.requestPointBackfill.mock.calls[0]![0]).toEqual({
      db: { marker: 'db' },
      enqueueBackfill: mocks.enqueue,
    });
    mocks.admin.requestPointBackfill.mockRejectedValueOnce(
      codedConflict('POINT_BACKFILL_UNAVAILABLE'),
    );
    expect(await requestPointBackfill({})).toEqual({
      ok: false,
      errorCode: 'POINT_BACKFILL_UNAVAILABLE',
    });
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.admin.listSuspicionFlags.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await listSuspicionFlags({})).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });
});
