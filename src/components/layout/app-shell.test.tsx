// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { AppShellClient as AppShell } from './app-shell-client';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

describe('AppShell', () => {
  it('atlama bağlantısı içeriğe götürür; ana bölge etiketlidir', () => {
    renderUi(
      <AppShell>
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
    renderUi(<AppShell>x</AppShell>);

    expect(screen.getByRole('navigation', { name: 'Ana gezinme' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Yan menü' })).toBeInTheDocument();
  });

  it('bulunulan sayfa aria-current="page" taşır', () => {
    renderUi(<AppShell>x</AppShell>);

    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(within(bottom).getByRole('link', { name: 'Ana sayfa' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('henüz sayfası olmayan sekmeler bağlantı değildir ve “yakında” olarak duyurulur', () => {
    renderUi(<AppShell>x</AppShell>);

    const bottom = screen.getByRole('navigation', { name: 'Ana gezinme' });
    expect(within(bottom).queryByRole('link', { name: /Mentorlar/ })).not.toBeInTheDocument();
    expect(within(bottom).getByText(/Mentorlar/)).toHaveTextContent('yakında');
  });
});

it('Hesabım bağlantısını gösterir, yönetimi yalnız sunucudan açıkça izin verilirse sunar', () => {
  const { rerender } = renderUi(<AppShell>x</AppShell>);
  const side = screen.getByRole('navigation', { name: 'Yan menü' });
  expect(within(side).getByRole('link', { name: 'Hesabım' })).toHaveAttribute('href', '/hesap');
  expect(within(side).queryByRole('link', { name: 'Yönetim' })).not.toBeInTheDocument();
  rerender(<AppShell showAdmin>x</AppShell>);
  expect(within(side).getByRole('link', { name: 'Yönetim' })).toHaveAttribute('href', '/yonetim');
});

it.each(['/giris', '/giris/epostani-kontrol-et', '/giris/test'])(
  '%s: yalnız logo ve içerik, uygulama menüsü yok',
  (pathname) => {
    navigation.pathname = pathname;
    try {
      renderUi(<AppShell showAdmin>İçerik</AppShell>);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveTextContent('İçerik');
      expect(screen.getByRole('link', { name: 'MezunPortal' })).toHaveAttribute('href', '/');
    } finally {
      navigation.pathname = '/';
    }
  },
);
