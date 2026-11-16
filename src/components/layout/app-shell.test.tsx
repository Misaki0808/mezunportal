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

  it('yan menüdeki her öğe ayrı simge taşır', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const side = screen.getByRole('navigation', { name: 'Yan menü' });
    const icons = within(side)
      .getAllByRole('link')
      .map((link) => link.querySelector('svg')?.innerHTML ?? '');
    expect(icons.every((icon) => icon !== '')).toBe(true);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('yan menü ana grubu yalnız gerçek rotaları, sırayla listeler; hesap grubu bildirim, profil ve hesap ayarlarını içerir', () => {
    renderUi(
      <AppShell signedIn canRefreshNotifications unreadNotifications={2}>
        x
      </AppShell>,
    );
    const side = screen.getByRole('navigation', { name: 'Yan menü' });
    const hrefs = within(side)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/',
      '/ilanlar',
      '/mentorlar',
      '/mezunlar',
      '/randevular',
      '/deneyimler',
      '/etkinlikler',
      '/ders-rehberi',
      '/bildirimler',
      '/profil',
      '/hesap',
    ]);
    const account = within(side).getByRole('list', { name: 'Hesap' });
    expect(within(account).getByRole('link', { name: /Bildirimler/ })).toBeVisible();
    // Profilim gerçek profildir; hesap ayarları ayrı kalemdir.
    expect(within(account).getByRole('link', { name: 'Profilim' })).toHaveAttribute(
      'href',
      '/profil',
    );
    expect(within(account).getByRole('link', { name: 'Hesap ayarları' })).toHaveAttribute(
      'href',
      '/hesap',
    );
    // Yer tutucu ya da "yakında" öğesi yok.
    expect(within(side).queryByText(/yakında/)).toBeNull();
  });

  it('telefon alt çubuğu beş sekmedir: Ana sayfa, İlanlar, Mentorlar, Randevular, Profil', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    const links = within(bottom).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/ilanlar',
      '/mentorlar',
      '/randevular',
      '/profil',
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      'Ana sayfa',
      'İlanlar',
      'Mentorlar',
      'Randevular',
      'Profil',
    ]);
    // Görünen ad erişilebilir adın içindedir (WCAG 2.5.3): "Profil" ⊂ "Profilim".
    expect(within(bottom).getByRole('link', { name: 'Profilim' })).toBeVisible();
    expect(bottom.querySelector('ul')?.className).toContain('grid-cols-5');
  });

  it('etkin yan menü öğesi etkin zemin ve solda mercan çizgi taşır; etkin olmayanda yok', () => {
    navigation.pathname = '/randevular/42';
    try {
      renderUi(<AppShell signedIn>x</AppShell>);
      const side = screen.getByRole('navigation', { name: 'Yan menü' });
      const active = within(side).getByRole('link', { name: 'Randevular' });
      expect(active).toHaveAttribute('aria-current', 'page');
      expect(active.className).toContain('bg-side-active');
      expect(active.className).toContain('inset_3px_0_0_var(--color-accent)');
      const other = within(side).getByRole('link', { name: 'Mentorlar' });
      expect(other).not.toHaveAttribute('aria-current');
      expect(other.className).not.toContain('inset_3px_0_0');
    } finally {
      navigation.pathname = '/';
    }
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
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute('href', '/bildirimler');
    // Telefon üst çubuğunda, bilgisayar üst çubuğunda ve yan menüde birer tane; alt gezinmede yok (beş sekme sabit).
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
    expect(screen.getAllByRole('link', { name: 'Bildirimler' })).toHaveLength(3);
    expect(screen.queryByTestId('bell-badge')).toBeNull();
    expect(screen.queryByTestId('bell-dot')).toBeNull();
  });

  it('girişsiz kullanıcıya bildirim girişi gösterilmez', () => {
    navigation.pathname = '/mentorlar';
    renderUi(<AppShell unreadNotifications={9}>x</AppShell>);
    expect(screen.queryByRole('link', { name: /Bildirimler/ })).toBeNull();
    navigation.pathname = '/';
  });
});

it('Profilim bağlantısını gösterir, yönetimi yalnız sunucudan açıkça izin verilirse ayrı grupta sunar', () => {
  const { rerender } = renderUi(<AppShell signedIn>x</AppShell>);
  const side = screen.getByRole('navigation', { name: 'Yan menü' });
  expect(within(side).getByRole('link', { name: 'Profilim' })).toHaveAttribute('href', '/profil');
  expect(within(side).queryByRole('link', { name: 'Yönetim' })).not.toBeInTheDocument();
  expect(within(side).queryByRole('list', { name: 'Yönetici' })).not.toBeInTheDocument();
  rerender(
    <AppShell signedIn showAdmin>
      x
    </AppShell>,
  );
  const admin = within(side).getByRole('list', { name: 'Yönetici' });
  expect(within(admin).getByRole('link', { name: 'Yönetim' })).toHaveAttribute('href', '/yonetim');
});

describe('AppShell: görünüm A iskeleti', () => {
  it('içerik en çok 1280 px ve sola yaslıdır (ortalanmaz); kabuk dolgusunu kendisi verir', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const content = screen.getByRole('main').firstElementChild as HTMLElement;
    expect(content.className).toContain('app-content');
    expect(content.className).toContain('max-w-[80rem]');
    expect(content.className).not.toContain('mx-auto');
    // Telefon 16 px, bilgisayar 28/32 px.
    expect(content.className).toContain('px-4');
    expect(content.className).toContain('lg:px-8');
    expect(content.className).toContain('lg:pt-7');
  });

  it('yan menü 252 px, iki temada lacivert token ile çizilir ve yalnız bilgisayarda görünür', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('w-[15.75rem]');
    expect(aside.className).toContain('bg-side-bg');
    expect(aside.className).toContain('hidden');
    expect(aside.className).toContain('lg:flex');
  });

  it('alt kartta ad ve "bölüm · sınıf" görünür; üyelik yoksa yalnız ad', () => {
    const { rerender } = renderUi(
      <AppShell
        signedIn
        shellUser={{
          name: 'Deniz Aksoy',
          membership: { departmentCode: 'YBS', standing: 'GRADE', grade: 3 },
        }}
      >
        x
      </AppShell>,
    );
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByText('Deniz Aksoy')).toBeVisible();
    expect(within(aside).getByText('YBS · 3. sınıf')).toBeVisible();
    rerender(
      <AppShell signedIn shellUser={{ name: 'Deniz Aksoy', membership: null }}>
        x
      </AppShell>,
    );
    expect(within(aside).getByText('Deniz Aksoy')).toBeVisible();
    expect(within(aside).queryByText(/·/)).toBeNull();
    rerender(<AppShell signedIn>x</AppShell>);
    expect(within(aside).queryByText('Deniz Aksoy')).toBeNull();
  });

  it('alt kart hesap ayarlarına bağlanır (kullanıcı kartı ve avatar /hesap, Profilim /profil)', () => {
    renderUi(
      <AppShell signedIn shellUser={{ name: 'Deniz Aksoy', membership: null }}>
        x
      </AppShell>,
    );
    const aside = screen.getByRole('complementary');
    expect(
      within(aside).getByRole('link', { name: 'Hesap ayarları: Deniz Aksoy' }),
    ).toHaveAttribute('href', '/hesap');
    // Üst çubuktaki avatar da hesap ayarlarına gider (telefon ve bilgisayar).
    const avatars = screen.getAllByRole('link', { name: 'Hesabım' });
    expect(avatars.length).toBeGreaterThan(0);
    for (const avatar of avatars) expect(avatar).toHaveAttribute('href', '/hesap');
  });

  it.each([
    ['PREPARATORY', 'YBS · Hazırlık'],
    ['ALUMNI', 'YBS · Mezun'],
    ['ACADEMIC', 'YBS · Akademisyen'],
    ['NONE', 'YBS'],
  ] as const)('alt kart %s için "%s" yazar', (standing, text) => {
    renderUi(
      <AppShell
        signedIn
        shellUser={{ name: 'Ada', membership: { departmentCode: 'YBS', standing } }}
      >
        x
      </AppShell>,
    );
    expect(within(screen.getByRole('complementary')).getByText(text)).toBeVisible();
  });

  it('bilgisayar üst çubuğunda deneyim araması gerçek rotaya gider; sorgu en az iki karakterdir', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('action', '/deneyimler');
    expect(form).toHaveAttribute('method', 'get');
    const input = within(form).getByRole('searchbox', { name: 'Deneyimlerde ara' });
    expect(input).toHaveAttribute('name', 'q');
    expect(input).toHaveAttribute('minlength', '2');
    expect(input).toHaveAttribute('maxlength', '100');
  });

  it('hesap avatarı yalnız kullanıcı adı varken ve profile bağlanır (iki üst çubukta)', () => {
    const { rerender } = renderUi(<AppShell signedIn>x</AppShell>);
    expect(screen.queryByRole('link', { name: 'Hesabım' })).toBeNull();
    rerender(
      <AppShell signedIn shellUser={{ name: 'Ada Yılmaz', membership: null }}>
        x
      </AppShell>,
    );
    const links = screen.getAllByRole('link', { name: 'Hesabım' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/hesap');
  });

  it('onay beklerken arama, zil ve avatar çizilmez', () => {
    renderUi(
      <AppShell signedIn consentPending shellUser={{ name: 'Ada', membership: null }}>
        x
      </AppShell>,
    );
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('link', { name: /Bildirimler/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Hesabım' })).toBeNull();
    expect(screen.queryByText('Ada')).toBeNull();
  });

  it('oturumsuz ziyaretçi herhangi bir sayfada yan menüsüz çizilir ve "Giriş yap" görür', () => {
    navigation.pathname = '/hukuki/gizlilik';
    try {
      renderUi(<AppShell>İçerik</AppShell>);
      expect(screen.queryByRole('navigation')).toBeNull();
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/giris');
      expect(screen.getByRole('main')).toHaveTextContent('İçerik');
    } finally {
      navigation.pathname = '/';
    }
  });

  it('giriş ekranında "Giriş yap" bağlantısı tekrar edilmez', () => {
    navigation.pathname = '/giris';
    try {
      renderUi(<AppShell>İçerik</AppShell>);
      expect(screen.queryByRole('link', { name: 'Giriş yap' })).toBeNull();
    } finally {
      navigation.pathname = '/';
    }
  });
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

describe('AppShell: tema düğmesi (kart 383)', () => {
  const buttons = () => screen.queryAllByRole('button', { name: /temaya geç/ });

  it('oturumlu kabukta hem telefon hem bilgisayar üst çubuğunda vardır; lacivert yan menüde yoktur', () => {
    renderUi(<AppShell signedIn>x</AppShell>);
    // Biri `lg:hidden` telefon üst çubuğunda, biri yalnız geniş ekranda görünen bilgisayar üst çubuğunda (jsdom CSS uygulamaz: ikisi de DOM'da).
    expect(buttons()).toHaveLength(2);
    for (const button of buttons()) expect(button.closest('header')).not.toBeNull();
    expect(within(screen.getByRole('complementary')).queryAllByRole('button')).toHaveLength(0);
  });

  it('zorunlu onay beklerken de görünür (görünüm tercihi onaya bağlı değildir)', () => {
    renderUi(
      <AppShell signedIn consentPending>
        x
      </AppShell>,
    );
    expect(buttons()).toHaveLength(2);
  });

  it('giriş yapmamış (tanıtım dışı) sayfada da vardır', () => {
    navigation.pathname = '/hukuki/aydinlatma';
    try {
      renderUi(<AppShell>x</AppShell>);
      expect(buttons()).toHaveLength(1);
      expect(buttons()[0]!.closest('header')).not.toBeNull();
    } finally {
      navigation.pathname = '/';
    }
  });

  it('giriş ekranının sade üst çubuğunda da vardır', () => {
    navigation.pathname = '/giris';
    try {
      renderUi(<AppShell>x</AppShell>);
      expect(buttons()).toHaveLength(1);
      expect(buttons()[0]!.closest('header')).not.toBeNull();
    } finally {
      navigation.pathname = '/';
    }
  });

  it('girişsiz tanıtım sayfası kendi düzenini sunar (düğmeyi tanıtımın kendisi taşır)', () => {
    renderUi(
      <AppShell>
        <main>Karşılama</main>
      </AppShell>,
    );
    expect(buttons()).toHaveLength(0);
  });
});
