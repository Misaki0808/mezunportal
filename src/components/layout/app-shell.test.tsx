// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { readSignInAddress, rememberSignInAddress } from '@/lib/sign-in-address';

import { AppShellClient as AppShell } from './app-shell-client';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

describe('AppShell', () => {
  it('girişsiz ana sayfada karşılama kendi düzenini sunar', () => {
    renderUi(
      <AppShell>
        <main>Karşılama</main>
      </AppShell>,
    );
    expect(screen.getByRole('main')).toHaveTextContent('Karşılama');
    expect(screen.queryByRole('navigation', { name: 'Ana gezinme' })).not.toBeInTheDocument();
  });

  it('atlama bağlantısı içeriğe götürür; ana bölge etiketlidir', () => {
    renderUi(
      <AppShell signedIn>
        <p>İçerik</p>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'İçeriğe geç' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveTextContent('İçerik');
  });

  it('alt gezinme ve yan menü ayrı adlı gezinme bölgeleridir', () => {
    renderUi(<AppShell signedIn>x</AppShell>);

    expect(screen.getByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Yan menü' })).toBeInTheDocument();
  });

  it('zorunlu onay beklerken alt gezinme ve yan menü çizilmez; gövde alt boşluğu gezinme yüksekliği kadar değildir', () => {
    renderUi(
      <AppShell signedIn consentPending>
        x
      </AppShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Ana gezinme' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Yan menü' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-bottom-nav]')).toBeNull();
    const main = screen.getByRole('main');
    expect(main.className).not.toContain('4.5rem');
    // Yapışkan eylem çubuğu ekranın dibine inmek için kabuk işareti taşır (globals.css).
    expect(main.closest('[data-no-nav]')).not.toBeNull();
    // Üst çubuk ve marka kalır: kullanıcı yönünü kaybetmez.
    expect(screen.getAllByRole('link', { name: 'MezunPortal' }).length).toBeGreaterThan(0);
  });

  it('onay beklenmiyorsa gezinme ve gövde boşluğu bugünkü gibidir', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    expect(screen.getByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();
    expect(document.querySelector('[data-bottom-nav]')).not.toBeNull();
    expect(screen.getByRole('main').className).toContain('4.5rem');
    expect(document.querySelector('[data-no-nav]')).toBeNull();
  });

  it('giriş tamamlanınca (oturumlu ekran çizilince) kontrol ekranı için tutulan adres silinir; girişsizken dokunulmaz', () => {
    window.sessionStorage.clear();
    navigation.pathname = '/giris/epostani-kontrol-et';
    rememberSignInAddress('ayse@ogr.iu.edu.tr');
    const { unmount } = renderUi(<AppShell>x</AppShell>);
    expect(readSignInAddress()).toBe('ayse@ogr.iu.edu.tr');
    unmount();
    navigation.pathname = '/';
    renderUi(<AppShell signedIn>x</AppShell>);
    expect(readSignInAddress()).toBeNull();
  });

  it('bulunulan sayfa aria-current="page" taşır', () => {
    renderUi(<AppShell signedIn>x</AppShell>);

    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(within(bottom).getByRole('link', { name: 'Ana sayfa' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('Randevular sekmesi randevu listesine bağlanır', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(within(bottom).getByRole('link', { name: /Randevular/ })).toHaveAttribute(
      'href',
      '/randevular',
    );
  });

  it('Mentorlar sekmesi mentor dizinine bağlanır', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(within(bottom).getByRole('link', { name: /Mentorlar/ })).toHaveAttribute(
      'href',
      '/mentorlar',
    );
  });
});

describe('AppShell: bildirim girişi', () => {
  it('giriş yapmış kullanıcıda üst çubukta ve yan menüde, okunmamış sayısıyla görünür', () => {
    renderUi(
      <AppShell signedIn canRefreshNotifications unreadNotifications={3}>
        x
      </AppShell>,
    );
    const links = screen.getAllByRole('link', { name: 'Bildirimler, 3 okunmamış' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/bildirimler');
    // Üst çubukta (mobil) ve yan menüde (masaüstü) birer tane; alt gezinmede yok (altı sütun sabit).
    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(within(bottom).queryByRole('link', { name: /Bildirimler/ })).toBeNull();
    const side = screen.getByRole('navigation', { name: 'Yan menü' });
    expect(within(side).getByRole('link', { name: /Bildirimler/ })).toBeVisible();
  });

  it('okunmamış yokken rozet yok; ad yalnız "Bildirimler"', () => {
    renderUi(
      <AppShell signedIn canRefreshNotifications unreadNotifications={0}>
        x
      </AppShell>,
    );
    expect(screen.getAllByRole('link', { name: 'Bildirimler' })).toHaveLength(2);
    expect(screen.queryByTestId('bell-badge')).toBeNull();
  });

  it('girişsiz kullanıcıya bildirim girişi gösterilmez', () => {
    navigation.pathname = '/mentorlar';
    renderUi(<AppShell unreadNotifications={9}>x</AppShell>);
    expect(screen.queryByRole('link', { name: /Bildirimler/ })).toBeNull();
    navigation.pathname = '/';
  });
});

it('Hesabım bağlantısını gösterir, yönetimi yalnız sunucudan açıkça izin verilirse sunar', () => {
  const { rerender } = renderUi(<AppShell signedIn>x</AppShell>);
  const side = screen.getByRole('navigation', { name: 'Yan menü' });
  expect(within(side).getByRole('link', { name: 'Hesabım' })).toHaveAttribute('href', '/hesap');
  expect(within(side).queryByRole('link', { name: 'Yönetim' })).not.toBeInTheDocument();
  rerender(
    <AppShell signedIn showAdmin>
      x
    </AppShell>,
  );
  expect(within(side).getByRole('link', { name: 'Yönetim' })).toHaveAttribute('href', '/yonetim');
});

it.each(['/giris', '/giris/epostani-kontrol-et', '/giris/test'])(
  '%s: yalnız logo ve içerik, uygulama menüsü yok',
  (pathname) => {
    navigation.pathname = pathname;
    try {
      renderUi(
        <AppShell signedIn showAdmin>
          İçerik
        </AppShell>,
      );
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveTextContent('İçerik');
      expect(screen.getByRole('link', { name: 'MezunPortal' })).toHaveAttribute('href', '/');
    } finally {
      navigation.pathname = '/';
    }
  },
);
