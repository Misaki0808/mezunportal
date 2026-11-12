import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUserWithoutConsent: vi.fn(),
  requireConsent: vi.fn(),
  countMyUnread: vi.fn(),
}));
vi.mock('@/server/db', () => ({ getDb: () => ({}) }));
vi.mock('@/server/permissions', () => ({
  requireUserWithoutConsent: mocks.requireUserWithoutConsent,
}));
vi.mock('@/server/services/privacy', () => ({ requireConsent: mocks.requireConsent }));
vi.mock('@/server/services/inbox', () => ({ countMyUnread: mocks.countMyUnread }));

import { GET } from './route';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/bildirimler/okunmamis', () => {
  it('oturumsuz: 401, sayı sorgulanmaz', async () => {
    mocks.requireUserWithoutConsent.mockRejectedValue(new Error('AUTH_UNAUTHENTICATED'));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.countMyUnread).not.toHaveBeenCalled();
  });

  it('oturum açık ama zorunlu onay bekliyor (/onay): 4xx değil 0 döner, sayı sorgulanmaz', async () => {
    mocks.requireUserWithoutConsent.mockResolvedValue({ userId: 'u1' });
    mocks.requireConsent.mockRejectedValue(new Error('AUTH_CONSENT_REQUIRED'));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unread: 0 });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.countMyUnread).not.toHaveBeenCalled();
  });

  it('onaylı oturum: yalnız kendi okunmamış sayısı', async () => {
    mocks.requireUserWithoutConsent.mockResolvedValue({ userId: 'u1' });
    mocks.requireConsent.mockResolvedValue(undefined);
    mocks.countMyUnread.mockResolvedValue(7);
    const response = await GET();
    expect(await response.json()).toEqual({ unread: 7 });
    expect(mocks.countMyUnread).toHaveBeenCalledWith(expect.anything(), 'u1');
  });
});
