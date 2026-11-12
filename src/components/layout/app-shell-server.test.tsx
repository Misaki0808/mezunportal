import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  actor: vi.fn(),
  count: vi.fn(),
}));
vi.mock('./admin-access', () => ({ hasAdminAccess: mocks.admin }));
vi.mock('@/server/permissions', () => ({ requireUserWithoutConsent: mocks.actor }));
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
});

describe('AppShell (sunucu): okunmamış bildirim sayısı', () => {
  it('giriş yapmış kullanıcının kendi sayısı istemci kabuğuna verilir; sayı oturumdaki kimlikle sorulur', async () => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.count.mockResolvedValue(4);
    const shell = await render();
    expect(shell.type).toBe(AppShellClient);
    expect(shell.props).toMatchObject({ signedIn: true, unreadNotifications: 4 });
    expect(mocks.count).toHaveBeenCalledWith({ db: 'db' }, 'u1');
  });

  it('girişsizde sayım yapılmaz, sayı 0', async () => {
    mocks.actor.mockRejectedValue(new Error('oturum yok'));
    const shell = await render();
    expect(shell.props).toMatchObject({ signedIn: false, unreadNotifications: 0 });
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('sayım başarısız olursa sayfa yine açılır (rozet süs bilgidir), sayı 0', async () => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.count.mockRejectedValue(new Error('veritabanı'));
    const shell = await render();
    expect(shell.props).toMatchObject({ signedIn: true, unreadNotifications: 0 });
  });
});
