import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  actor: vi.fn(),
  consented: vi.fn(),
  count: vi.fn(),
  shellUser: vi.fn(),
}));
vi.mock('./admin-access', () => ({ hasAdminAccess: mocks.admin }));
vi.mock('@/server/permissions', () => ({
  requireUserWithoutConsent: mocks.actor,
  requireUser: mocks.consented,
}));
vi.mock('@/server/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/services/inbox', () => ({ countMyUnread: mocks.count }));
vi.mock('@/server/services/shell-user', () => ({ getShellUser: mocks.shellUser }));

import { AppShell } from './app-shell';
import { AppShellClient } from './app-shell-client';

type ShellElement = {
  type: unknown;
  props: { signedIn: boolean; unreadNotifications: number; shellUser: unknown };
};
async function render() {
  return (await AppShell({ children: 'x' })) as unknown as ShellElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue(false);
  mocks.consented.mockResolvedValue({ userId: 'u1' });
  mocks.shellUser.mockResolvedValue(null);
});

describe('AppShell (sunucu): okunmamış bildirim sayısı', () => {
  it('oturumdaki Next kontrol sinyalini yutmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    mocks.actor.mockRejectedValue(signal);
    await expect(render()).rejects.toBe(signal);
  });
  it('rıza sorgusundaki Next kontrol sinyalini yutmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.consented.mockRejectedValue(signal);
    await expect(render()).rejects.toBe(signal);
  });

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

describe('AppShell (sunucu): yan menü alt kartı', () => {
  const user = {
    name: 'Deniz Aksoy',
    membership: { departmentCode: 'YBS', standing: 'GRADE', grade: 3 },
  };

  it('oturumdaki kullanıcının KENDİ kartı, oturumdaki kimlikle sorulup kabuğa verilir', async () => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.count.mockResolvedValue(0);
    mocks.shellUser.mockResolvedValue(user);
    const shell = await render();
    expect(shell.props.shellUser).toEqual(user);
    expect(mocks.shellUser).toHaveBeenCalledWith({ db: 'db' }, 'u1');
  });

  it('kart süstür: okunamazsa sayfa yine açılır, kart yok', async () => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.count.mockResolvedValue(2);
    mocks.shellUser.mockRejectedValue(new Error('veritabanı'));
    const shell = await render();
    expect(shell.props).toMatchObject({ signedIn: true, unreadNotifications: 2, shellUser: null });
  });

  it('girişsizde ve rızası eksikte kart sorgusu yapılmaz', async () => {
    mocks.actor.mockRejectedValue(new Error('oturum yok'));
    expect((await render()).props.shellUser).toBeNull();
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.consented.mockRejectedValue(codedForbidden('CONSENT_REQUIRED'));
    expect((await render()).props.shellUser).toBeNull();
    expect(mocks.shellUser).not.toHaveBeenCalled();
  });
});

it('rızası eksik kullanıcı giriş yapmış görünür ama rozet iş verisi okunmaz', async () => {
  mocks.actor.mockResolvedValue({ userId: 'u1' });
  mocks.consented.mockRejectedValue(codedForbidden('CONSENT_REQUIRED'));
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

it.each([
  ['veritabanı hatası', () => new Error('veritabanı')],
  ['başka bir yasak kodu', () => codedForbidden('AUTH_FORBIDDEN')],
])(
  'rıza dışındaki bir hata (%s) gezinmeyi gizlemez: yalnız CONSENT_REQUIRED gizler',
  async (_ad, makeError) => {
    mocks.actor.mockResolvedValue({ userId: 'u1' });
    mocks.consented.mockRejectedValue(makeError());
    const shell = await render();
    expect(shell.props).toMatchObject({
      signedIn: true,
      consentPending: false,
      canRefreshNotifications: false,
      unreadNotifications: 0,
    });
    expect(mocks.count).not.toHaveBeenCalled();
  },
);
