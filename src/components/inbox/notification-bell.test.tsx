// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const navigation = vi.hoisted(() => ({ pathname: '/ilanlar' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

import { INBOX_CHANGED_EVENT, NotificationBell } from './notification-bell';

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
    renderUi(<NotificationBell initial={0} layout="header" />);
    const link = screen.getByRole('link', { name: 'Bildirimler' });
    expect(link).toHaveAttribute('href', '/bildirimler');
    expect(screen.queryByTestId('bell-badge')).toBeNull();
  });

  it('okunmamış sayısı erişilebilir adda yazılır; görsel rozet ekran okuyucudan gizlidir', () => {
    renderUi(<NotificationBell initial={3} layout="header" />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 3 okunmamış' })).toBeVisible();
    const badge = screen.getByTestId('bell-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });

  it('üst sınırda "99+" gösterilir ve ad bunu söyler', () => {
    renderUi(<NotificationBell initial={100} layout="header" />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 99’dan fazla okunmamış' })).toBeVisible();
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('99+');
  });

  it('yan menü düzeninde metin ve rozet birlikte görünür', () => {
    renderUi(<NotificationBell initial={5} layout="side" />);
    expect(screen.getByRole('link', { name: 'Bildirimler, 5 okunmamış' })).toHaveTextContent(
      'Bildirimler',
    );
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('5');
  });

  it('bildirim sayfasındayken geçerli sayfa işaretlenir', () => {
    navigation.pathname = '/bildirimler';
    renderUi(<NotificationBell initial={0} layout="side" />);
    expect(screen.getByRole('link', { name: 'Bildirimler' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('NotificationBell: sayı tazeleme', () => {
  it('ilk çizimde istek atmaz (sayı sunucudan gelir)', () => {
    renderUi(<NotificationBell initial={2} layout="header" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kutuda okundu işaretlenince sayıyı küçük bir GET ile yeniden okur ve rozeti günceller', async () => {
    reply(0);
    renderUi(<NotificationBell initial={4} layout="header" />);
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
    renderUi(<NotificationBell initial={1} layout="header" />);
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('7'));
  });

  it('sunucu hatası, ağ hatası ya da bozuk yanıt rozeti bozmaz', async () => {
    renderUi(<NotificationBell initial={2} layout="header" />);
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
    const { rerender } = renderUi(<NotificationBell initial={1} layout="header" />);
    act(() => void window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)));
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('9'));
    rerender(<NotificationBell initial={2} layout="header" />);
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('2'));
  });
});
