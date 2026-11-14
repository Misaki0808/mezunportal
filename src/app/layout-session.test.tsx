import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: vi.fn(), log: vi.fn() }));
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'body' }),
  Plus_Jakarta_Sans: () => ({ variable: 'heading' }),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'tr', getTranslations: vi.fn() }));
vi.mock('next-intl', () => ({ NextIntlClientProvider: 'intl-provider' }));
vi.mock('@/components/layout/app-shell', () => ({ AppShell: 'app-shell' }));
vi.mock('@/components/layout/session-unavailable', () => ({
  SessionUnavailable: 'session-unavailable',
}));
vi.mock('@/components/ui', () => ({ ErrorState: 'error-state', ToastProvider: 'toast-provider' }));
vi.mock('@/server/permissions/session', () => ({ getSessionUserId: state.session }));
vi.mock('@/server/unexpected-log', () => ({ logUnexpected: state.log }));
import RootLayout from './layout';

beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(null);
});
it('oturum çözümü başarısızsa ortak sınır içeriği açmaz, geçici hata ve tek günlük üretir', async () => {
  state.session.mockRejectedValue(new Error('sentetik'));
  const root = await RootLayout({ children: <div>gizli veri</div> });
  const toast = root.props.children.props.children.props.children;
  expect(toast.props.children.type).toBe('session-unavailable');
  expect(state.log).toHaveBeenCalledOnce();
});
it('oturum yoksa normal uygulama ağacı korunur', async () => {
  const root = await RootLayout({ children: <div>sayfa</div> });
  expect(root.props.children.props.children.props.children.props.children.type).toBe('app-shell');
  expect(state.log).not.toHaveBeenCalled();
});
it('Next kontrol sinyalini yutmaz', async () => {
  const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
  state.session.mockRejectedValue(signal);
  await expect(RootLayout({ children: null })).rejects.toBe(signal);
  expect(state.log).not.toHaveBeenCalled();
});
