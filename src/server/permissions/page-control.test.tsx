import { beforeEach, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
const state = vi.hoisted(() => ({ requireUser: vi.fn(), detail: vi.fn(), db: vi.fn() }));
vi.mock('@/server/permissions', () => ({
  requireUser: state.requireUser,
  requireUserWithoutConsent: state.requireUser,
}));
vi.mock('@/server/db', () => ({ getDb: state.db }));
vi.mock('@/app/detail-route', () => ({ requestExperienceDetail: state.detail }));
vi.mock('@/components/layout/admin-access', () => ({ hasAdminAccess: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
import DeletePage from '@/app/(kvkk)/hesap/hesabi-sil/page';
import AccountPage from '@/app/(kimlik)/hesap/page';
import ExperienceDetailPage from '@/app/(deneyim)/deneyim/[id]/page';
beforeEach(() => {
  vi.resetAllMocks();
  state.detail.mockResolvedValue({ ok: true, data: {} });
});
it.each([
  ['hesap silme', () => DeletePage()],
  ['hesap', () => AccountPage()],
  ['deneyim', () => ExperienceDetailPage({ params: Promise.resolve({ id: 'test' }) })],
])('%s: Next dinamik kullanım ve gerçek giriş yönlendirmesini yutmaz', async (_name, run) => {
  const dynamic = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
  let redirectSignal: unknown;
  try {
    redirect('/giris');
  } catch (error) {
    redirectSignal = error;
  }
  expect(redirectSignal).toBeDefined();
  for (const signal of [dynamic, redirectSignal]) {
    state.requireUser.mockRejectedValue(signal);
    await expect(run()).rejects.toBe(signal);
  }
  expect(state.db).not.toHaveBeenCalled();
});
it('hesap silmede gerçek oturum hatası içeriği açmaz', async () => {
  state.requireUser.mockRejectedValue(new Error('oturum yok'));
  await expect(DeletePage()).resolves.toBeNull();
  expect(state.db).not.toHaveBeenCalled();
});

it('hesapta gerçek oturum hatası yetkisiz durum döndürür', async () => {
  state.requireUser.mockRejectedValue(new Error('oturum yok'));
  await expect(AccountPage()).resolves.toMatchObject({
    props: { errorCode: 'AUTH_UNAUTHENTICATED' },
  });
  expect(state.db).not.toHaveBeenCalled();
});
