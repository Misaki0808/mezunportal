import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  actor: vi.fn(),
  consented: vi.fn(),
  count: vi.fn(),
}));
vi.mock('./admin-access', () => ({ hasAdminAccess: mocks.admin }));
vi.mock('@/server/permissions', () => ({
  requireUserWithoutConsent: mocks.actor,
  requireUser: mocks.consented,
}));
vi.mock('@/server/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/services/inbox', () => ({ countMyUnread: mocks.count }));

import { AppShell } from './app-shell';
import { AppShellClient } from './app-shell-client';

type ShellElement = { type: unknown; props: { signedIn: boolean; unreadNotifications: number } };
async function render() {
  return (await AppShell({ children: 'x' })) as unknown as ShellElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue(false);
  mocks.consented.mockResolvedValue({ userId: 'u1' });
});

describe('AppShell (sunucu): okunmamış bildirim sayısı', () => {
  it('giriş yapmış kullanıcının kendi sayısı istemci kabuğuna verilir; sayı oturumdaki kimlikle sorulur', async () => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.count.mockResolvedValue(4);
    const shell = await render();
    expect(shell.type).toBe(AppShellClient);
    expect(shell.props).toMatchObject({
      signedIn: true,
      consentPending: false,
      canRefreshNotifications: true,
      unreadNotifications: 4,
    });
    expect(mocks.count).toHaveBeenCalledWith({ db: 'db' }, 'u1');
  });

  it('girişsizde sayım yapılmaz, sayı 0', async () => {
    mocks.actor.mockRejectedValue(new Error('oturum yok'));
    const shell = await render();
    expect(shell.props).toMatchObject({
      signedIn: false,
      consentPending: false,
      canRefreshNotifications: false,
      unreadNotifications: 0,
    });
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('sayım başarısız olursa sayfa yine açılır (rozet süs bilgidir), sayı 0', async () => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.count.mockRejectedValue(new Error('veritabanı'));
    const shell = await render();
    expect(shell.props).toMatchObject({
      signedIn: true,
      canRefreshNotifications: true,
      unreadNotifications: 0,
    });
  });
});

it('rızası eksik kullanıcı giriş yapmış görünür ama rozet iş verisi okunmaz', async () => {
  mocks.actor.mockResolvedValue({ userId: 'u1' });
  mocks.consented.mockRejectedValue(new Error('CONSENT_REQUIRED'));
  const shell = await render();
  expect(shell.props).toMatchObject({
    signedIn: true,
    // Oturum var, onay yok: gezinme kapalı (kart 316); girişsiz ziyaretçiye bu bayrak verilmez.
    consentPending: true,
    canRefreshNotifications: false,
    unreadNotifications: 0,
  });
  expect(mocks.count).not.toHaveBeenCalled();
});
