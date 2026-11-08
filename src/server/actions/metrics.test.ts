import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ requireAnyAdmin: vi.fn(), getUsageMetrics: vi.fn() }));
vi.mock('../permissions', () => ({ requireAnyAdmin: mocks.requireAnyAdmin }));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/usage-metrics', () => ({ getUsageMetrics: mocks.getUsageMetrics }));

import { getUsageMetrics } from './metrics';

const range = { from: '2031-03-01T00:00:00Z', to: '2031-04-01T00:00:00Z' };
beforeEach(() => {
  mocks.requireAnyAdmin.mockReset().mockResolvedValue({ userId: 'oturum-yoneticisi', facts: {} });
  mocks.getUsageMetrics.mockReset();
});

describe('getUsageMetrics eylemi', () => {
  it('koruma servisten önce gelir: oturumsuz/yetkisizde servis çağrılmaz', async () => {
    mocks.requireAnyAdmin.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await getUsageMetrics(range as never)).toEqual({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
    mocks.requireAnyAdmin.mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    expect(await getUsageMetrics(range as never)).toEqual({
      ok: false,
      errorCode: 'AUTH_FORBIDDEN',
    });
    expect(mocks.getUsageMetrics).not.toHaveBeenCalled();
  });

  it('kimlik oturumdan gelir; doğrulanmış süzgeç servise gider', async () => {
    mocks.getUsageMetrics.mockResolvedValue({ ok: 1 });
    expect(await getUsageMetrics({ ...range, departmentId: ' bolum-1 ' } as never)).toEqual({
      ok: true,
      data: { ok: 1 },
    });
    const args = mocks.getUsageMetrics.mock.calls[0]!;
    expect(args[0]).toEqual({ db: { marker: 'db' } });
    expect(args[1]).toBe('oturum-yoneticisi');
    expect(args[2]).toMatchObject({ departmentId: 'bolum-1' });
    expect(args[2].from).toEqual(new Date('2031-03-01T00:00:00Z'));
  });

  it('geçersiz girdi (ters aralık, çok geniş aralık, kimlik/rol alanı) servise ulaşmaz', async () => {
    for (const input of [
      { from: range.to, to: range.from },
      { from: '2030-01-01T00:00:00Z', to: '2032-01-01T00:00:00Z' },
      { ...range, userId: 'baska' },
      { ...range, departmentId: 'd', facultyId: 'f' },
    ]) {
      expect(await getUsageMetrics(input as never)).toMatchObject({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
      });
    }
    expect(mocks.getUsageMetrics).not.toHaveBeenCalled();
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.getUsageMetrics.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await getUsageMetrics(range as never)).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });
});
