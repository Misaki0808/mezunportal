import { beforeEach, expect, it, vi } from 'vitest';
import { codedForbidden, codedUnauthenticated } from '@/lib/errors';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  consume: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({ requireUser: mocks.user }));
vi.mock('@/server/db', () => ({ getDb: mocks.db }));
vi.mock('@/lib/env', () => ({ getAuthEnv: () => ({ BETTER_AUTH_SECRET: 'review-secret' }) }));
vi.mock('@/server/services/notification-preferences', () => ({
  getNotificationPreferences: mocks.get,
  setNotificationPreferences: mocks.set,
}));
vi.mock('@/server/services/still-there', () => ({ consumeStillThere: mocks.consume }));
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  answerStillThere,
} from './notifications';
const input = { items: [{ type: 'CONTACT_REQUEST' as const, enabled: false }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ userId: 'session-user' });
  mocks.db.mockReturnValue({ marker: 'db' });
  mocks.get.mockResolvedValue({ items: [] });
  mocks.set.mockResolvedValue({ items: [] });
  mocks.consume.mockResolvedValue('YES');
});
it.each(['anonymous', 'suspended'])(
  'inceleyici: %s hesapta üç eylem de veri okumadan/yazmadan reddedilir',
  async (kind) => {
    mocks.user.mockRejectedValue(
      kind === 'anonymous'
        ? codedUnauthenticated('AUTH_UNAUTHENTICATED')
        : codedForbidden('AUTH_ACCOUNT_SUSPENDED'),
    );
    for (const action of [
      () => getMyNotificationPreferences(),
      () => updateMyNotificationPreferences(input),
      () => answerStillThere({ token: 'signed-token', choice: 'YES' }),
    ])
      expect(await action()).toEqual({
        ok: false,
        errorCode: kind === 'anonymous' ? 'AUTH_UNAUTHENTICATED' : 'AUTH_ACCOUNT_SUSPENDED',
      });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  },
);
it('inceleyici: tercih ve imzalı yanıtın sahibi yalnız oturumdan gelir', async () => {
  await getMyNotificationPreferences();
  expect(mocks.get).toHaveBeenCalledWith({ marker: 'db' }, 'session-user');
  await updateMyNotificationPreferences(input);
  expect(mocks.set).toHaveBeenCalledWith({ marker: 'db' }, 'session-user', input);
  const answer = { token: 'signed-token', choice: 'YES' as const };
  await answerStillThere(answer);
  expect(mocks.consume).toHaveBeenCalledWith(
    { marker: 'db' },
    answer,
    'review-secret',
    'session-user',
  );
});
it('inceleyici: istemci kimliği ve kapalı zorunlu tercih servis yazımına ulaşmaz', async () => {
  for (const invalid of [
    { ...input, userId: 'other' },
    { items: [{ type: 'ACCOUNT_SECURITY', enabled: false }] },
  ])
    expect(await updateMyNotificationPreferences(invalid as never)).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
    });
  expect(mocks.set).not.toHaveBeenCalled();
});
