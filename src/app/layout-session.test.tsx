import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: vi.fn(), log: vi.fn(), cookie: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => state.cookie(name) }),
}));
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
  state.cookie.mockReturnValue(undefined);
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

it('görünüm çerezi <html data-theme> olarak yazılır; bozuk ya da yok ise system', async () => {
  const themeOf = async () => (await RootLayout({ children: null })).props['data-theme'] as string;
  state.cookie.mockImplementation((name: string) =>
    name === 'theme' ? { value: 'dark' } : undefined,
  );
  expect(await themeOf()).toBe('dark');
  state.cookie.mockImplementation((name: string) =>
    name === 'theme' ? { value: 'light' } : undefined,
  );
  expect(await themeOf()).toBe('light');
  state.cookie.mockImplementation((name: string) =>
    name === 'theme' ? { value: 'kırmızı' } : undefined,
  );
  expect(await themeOf()).toBe('system');
  state.cookie.mockReturnValue(undefined);
  expect(await themeOf()).toBe('system');
});

it('tarayıcı çubuğu rengi tercihi izler: elle seçimde tek renk, sistemde iki medya etiketi', async () => {
  const { generateViewport } = await import('./layout');
  state.cookie.mockImplementation((name: string) =>
    name === 'theme' ? { value: 'dark' } : undefined,
  );
  expect((await generateViewport()).themeColor).toBe('#0e1a38');
  state.cookie.mockImplementation((name: string) =>
    name === 'theme' ? { value: 'light' } : undefined,
  );
  expect((await generateViewport()).themeColor).toBe('#5b5bf6');
  state.cookie.mockReturnValue(undefined);
  const system = (await generateViewport()).themeColor;
  expect(system).toEqual([
    { media: '(prefers-color-scheme: light)', color: '#5b5bf6' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1a38' },
  ]);
  state.cookie.mockImplementation((name: string) =>
    name === 'theme' ? { value: 'mor' } : undefined,
  );
  expect((await generateViewport()).themeColor).toEqual(system);
});
