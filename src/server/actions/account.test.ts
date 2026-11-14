import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedRateLimited } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  service: { getMyAccountName: vi.fn(), updateMyName: vi.fn() },
}));
vi.mock('../permissions', () => ({ requireUser: mocks.guard }));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/account-name', () => mocks.service);
vi.mock('../fail-action', async () => {
  const { actionFailure } = await import('@/lib/action-result');
  return { failAction: async (error: unknown) => actionFailure(error) };
});

import * as actions from './account';

beforeEach(() => {
  mocks.guard.mockReset().mockResolvedValue({ userId: 'current-user' });
  mocks.service.getMyAccountName.mockReset().mockResolvedValue({ name: 'Ayşe Yılmaz' });
  mocks.service.updateMyName.mockReset().mockResolvedValue({ name: 'Ayşe Yılmaz', changed: true });
});

describe('hesap adı eylemleri', () => {
  it('okuma oturumdan gelen kullanıcıyla yapılır', async () => {
    expect(await actions.getMyAccountName()).toEqual({ ok: true, data: { name: 'Ayşe Yılmaz' } });
    expect(mocks.service.getMyAccountName).toHaveBeenCalledWith(
      { db: { marker: 'db' } },
      'current-user',
    );
  });

  it('değiştirme yalnız oturumdaki kullanıcının adını, normalleştirilmiş değerle günceller', async () => {
    const result = await actions.updateMyName({ name: '  Ayşe   Yılmaz ' });
    expect(result).toEqual({ ok: true, data: { name: 'Ayşe Yılmaz', changed: true } });
    expect(mocks.service.updateMyName).toHaveBeenCalledWith(
      { db: { marker: 'db' } },
      'current-user',
      'Ayşe Yılmaz',
    );
  });

  it('başkasının kimliğini girdiyle vermek işe yaramaz: şema reddeder, servis hiç çağrılmaz', async () => {
    const result = await actions.updateMyName({ name: 'Ayşe Yılmaz', userId: 'baska' } as never);
    expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(mocks.service.updateMyName).not.toHaveBeenCalled();
  });

  it('geçersiz ad sunucuda da reddedilir (istemciye güvenilmez); alan hatası kararlı koddur', async () => {
    const result = await actions.updateMyName({ name: 'ayse yilmaz1989' });
    expect(result).toEqual({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { name: 'ACCOUNT_NAME_INVALID' },
    });
    expect(mocks.service.updateMyName).not.toHaveBeenCalled();
  });

  it('oturum kapısı hatası ve hız sınırı olduğu gibi döner; servis oturumsuz çağrılmaz', async () => {
    mocks.guard.mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    expect(await actions.updateMyName({ name: 'Ayşe Yılmaz' })).toMatchObject({
      ok: false,
      errorCode: 'AUTH_FORBIDDEN',
    });
    expect(mocks.service.updateMyName).not.toHaveBeenCalled();
    mocks.service.updateMyName.mockRejectedValueOnce(codedRateLimited('RATE_LIMITED'));
    expect(await actions.updateMyName({ name: 'Ayşe Yılmaz' })).toMatchObject({
      ok: false,
      errorCode: 'RATE_LIMITED',
    });
  });
});
