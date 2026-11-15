// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const navigation = vi.hoisted(() => ({ pathname: '/ilanlar' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

import { INBOX_CHANGED_EVENT, NotificationBell, UnreadProvider } from './notification-bell';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  navigation.pathname = '/ilanlar';
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const reply = (unread: unknown, ok = true) =>
  fetchMock.mockResolvedValue({ ok, json: async () => ({ unread }) });

describe('NotificationBell: ad ve rozet', () => {
  it('okunmamış yokken rozet yok, ad yalnız "Bildirimler"; bildirim kutusuna bağlanır', () => {
    renderUi(<NotificationBell initial={0} layout="header" refreshEnabled />);
    const link = screen.getByRole('link', { name: 'Bildirimler' });
    expect(link).toHaveAttribute('href', '/bildirimler');
    expect(screen.queryByTestId('bell-badge')).toBeNull();
  });

  it('okunmamış sayısı erişilebilir adda yazılır; görsel rozet ekran okuyucudan gizlidir', () => {
    renderUi(<NotificationBell initial={3} layout="header" refreshEnabled />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 3 okunmamış' })).toBeVisible();
    const badge = screen.getByTestId('bell-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });

  it('üst sınırda "99+" gösterilir ve ad bunu söyler', () => {
    renderUi(<NotificationBell initial={100} layout="header" refreshEnabled />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 99’dan fazla okunmamış' })).toBeVisible();
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('99+');
  });

  it('yan menü düzeninde metin ve rozet birlikte görünür', () => {
    renderUi(<NotificationBell initial={5} layout="side" refreshEnabled />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 5 okunmamış' })).toHaveTextContent(
      'Bildirimler',
    );
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('5');
  });

  it('bildirim sayfasındayken geçerli sayfa işaretlenir', () => {
    navigation.pathname = '/bildirimler';
    renderUi(<NotificationBell initial={0} layout="side" refreshEnabled />);
    expect(screen.getByRole('link', { name: 'Bildirimler' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('NotificationBell: bilgisayar üst çubuğu düzeni', () => {
  it('okunmamış varken sayı yerine nokta çizer; nokta ekran okuyucudan gizlidir, ad sayıyı söyler', () => {
    renderUi(<NotificationBell initial={4} layout="icon" refreshEnabled />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 4 okunmamış' })).toBeVisible();
    expect(screen.getByTestId('bell-dot')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('bell-badge')).toBeNull();
  });

  it('okunmamış yokken nokta yok; dokunma hedefi 44 px', () => {
    renderUi(<NotificationBell initial={0} layout="icon" refreshEnabled />);
    expect(screen.queryByTestId('bell-dot')).toBeNull();
    expect(screen.getByRole('link', { name: 'Bildirimler' }).className).toContain('size-11');
  });

  it('yan menü düzeni lacivert token kullanır; bildirim sayfasında etkin zemin ve mercan çizgi alır', () => {
    navigation.pathname = '/bildirimler';
    renderUi(<NotificationBell initial={0} layout="side" refreshEnabled />);
    const link = screen.getByRole('link', { name: 'Bildirimler' });
    expect(link.className).toContain('bg-side-active');
    expect(link.className).toContain('inset_3px_0_0_var(--color-accent)');
  });
});

describe('UnreadProvider: sayı tek yerde tazelenir', () => {
  it('üç zil örneği aynı sayıyı gösterir ve yenilemede tek GET atılır', async () => {
    reply(6);
    renderUi(
      <UnreadProvider initial={2} refreshEnabled>
        <NotificationBell initial={2} layout="header" refreshEnabled />
        <NotificationBell initial={2} layout="icon" refreshEnabled />
        <NotificationBell initial={2} layout="side" refreshEnabled />
      </UnreadProvider>,
    );
    expect(screen.getAllByRole('link', { name: 'Bildirimler, 2 okunmamış' })).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => void window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)));
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Bildirimler, 6 okunmamış' })).toHaveLength(3),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sağlayıcı yokken zil sayıyı kendisi tazeler (tek başına kullanım değişmedi)', async () => {
    reply(5);
    renderUi(<NotificationBell initial={1} layout="icon" refreshEnabled />);
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Bildirimler, 5 okunmamış' })).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshEnabled kapalıyken (rıza kapısı) sağlayıcı sayı göstermez ve istek atmaz', () => {
    renderUi(
      <UnreadProvider initial={7} refreshEnabled={false}>
        <NotificationBell initial={7} layout="side" refreshEnabled={false} />
      </UnreadProvider>,
    );
    expect(screen.queryByTestId('bell-badge')).toBeNull();
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('NotificationBell: sayı tazeleme', () => {
  it('ilk çizimde istek atmaz (sayı sunucudan gelir)', () => {
    renderUi(<NotificationBell initial={2} layout="header" refreshEnabled />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kutuda okundu işaretlenince sayıyı küçük bir GET ile yeniden okur ve rozeti günceller', async () => {
    reply(0);
    renderUi(<NotificationBell initial={4} layout="header" refreshEnabled />);
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('4');
    act(() => void window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)));
    await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bildirimler/okunmamis',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
    // Sunucu eylemi değil düz GET: yöntem belirtilmez.
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty('method');
    expect(screen.getByRole('link', { name: 'Bildirimler' })).toBeVisible();
  });

  it('pencere odağa dönünce yenilenir', async () => {
    reply(7);
    renderUi(<NotificationBell initial={1} layout="header" refreshEnabled />);
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('7'));
  });

  it('sunucu hatası, ağ hatası ya da bozuk yanıt rozeti bozmaz', async () => {
    renderUi(<NotificationBell initial={2} layout="header" refreshEnabled />);
    for (const setup of [
      () => reply(0, false),
      () => fetchMock.mockRejectedValue(new Error('ağ yok')),
      () => reply('çok'),
      () => reply(undefined),
    ]) {
      setup();
      act(() => void window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(screen.getByTestId('bell-badge')).toHaveTextContent('2');
      fetchMock.mockReset();
    }
  });

  it('sunucu yeni sayı verince (yeni düzen çizimi) getirilen eski değer atılır', async () => {
    reply(9);
    const { rerender } = renderUi(<NotificationBell initial={1} layout="header" refreshEnabled />);
    act(() => void window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)));
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('9'));
    rerender(<NotificationBell initial={2} layout="header" refreshEnabled />);
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('2'));
  });
});

it('rıza kapısında odak, görünürlük ve gezinme bildirim isteği başlatmaz; rıza sonrası yeniler', async () => {
  reply(3);
  navigation.pathname = '/onay';
  const { rerender } = renderUi(
    <NotificationBell initial={7} layout="header" refreshEnabled={false} />,
  );
  expect(screen.queryByTestId('bell-badge')).toBeNull();
  act(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  navigation.pathname = '/hesap/gizlilik';
  rerender(<NotificationBell initial={7} layout="header" refreshEnabled={false} />);
  expect(fetchMock).not.toHaveBeenCalled();
  rerender(<NotificationBell initial={0} layout="header" refreshEnabled />);
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('3'));
});
