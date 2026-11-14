'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import {
  BriefcaseIcon,
  CalendarIcon,
  HomeIcon,
  InboxIcon,
  UserIcon,
  UsersIcon,
  cn,
} from '@/components/ui';

import { NotificationBell } from '@/components/inbox/notification-bell';

import { forgetSignInAddress } from '@/lib/sign-in-address';

import { KeyboardState } from './keyboard-state';
import { BrandLogo } from '@/components/brand/logo';

/** Klavye kullanıcısının ilk durağı: odaklanınca görünür, `main`'e atlar. Konum sınıfları çağırana göre değişir. */
function SkipLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a
      href="#main-content"
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-2 focus:z-50 focus:rounded-control focus:bg-bg focus:px-4 focus:py-2 focus:shadow-overlay',
        className,
      )}
    >
      {children}
    </a>
  );
}

type NavId = 'home' | 'experiences' | 'jobs' | 'mentors' | 'appointments' | 'profile';

/**
 * YER TUTUCU gezinme: ürün sayfaları henüz yok (Faz 1). Yalnız `href`i olan öğe bağlantıdır;
 * diğerleri “yakında” olarak etkisiz gösterilir. Sekmeler ürün kararı değildir, Faz 1'de
 * gerçek sayfalar geldikçe `href` verilir ve liste PM kararıyla netleşir.
 */
const NAV_ITEMS: readonly { id: NavId; href?: string; icon: ReactNode }[] = [
  { id: 'home', href: '/', icon: <HomeIcon /> },
  { id: 'experiences', href: '/deneyimler', icon: <BriefcaseIcon /> },
  { id: 'jobs', href: '/ilanlar', icon: <BriefcaseIcon /> },
  { id: 'mentors', href: '/mentorlar', icon: <UsersIcon /> },
  { id: 'appointments', href: '/randevular', icon: <CalendarIcon /> },
  { id: 'profile', href: '/hesap', icon: <UserIcon /> },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/ilanlar' && pathname === '/ilanlarim') return true;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Uygulama düzeni: mobilde üst başlık + alt gezinme, ≥ 1024 px'te yan menü (docs/design.md).
 * Atlama bağlantısı klavye kullanıcısını gezinmenin üzerinden içeriğe taşır.
 */
export function AppShellClient({
  children,
  showAdmin = false,
  signedIn = false,
  consentPending = false,
  canRefreshNotifications = false,
  unreadNotifications = 0,
}: {
  children: ReactNode;
  showAdmin?: boolean;
  signedIn?: boolean;
  /** Oturum açık ama zorunlu onay eksik: gezinme henüz kullanılamayan yerlere götürür, bu yüzden çizilmez. */
  consentPending?: boolean;
  canRefreshNotifications?: boolean;
  /** Okunmamış bildirim sayısı (üst sınırlı); yalnız oturum açıkken anlamlıdır. */
  unreadNotifications?: number;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  // Giriş tamamlandı (oturumlu bir ekran çizildi): "E-postanı kontrol et" ekranı için tutulan adres bu sekmede kalmasın.
  useEffect(() => {
    if (signedIn) forgetSignInAddress();
  }, [signedIn]);

  // Girişsiz karşılama sayfası kendi gezinmesini ve ana içeriğini sunar.
  if (!signedIn && pathname === '/') return <>{children}</>;

  // PM kararı: giriş ve bağlantı kontrol ekranları uygulama gezinmesinden ayrıdır.
  if (pathname === '/giris' || pathname.startsWith('/giris/')) {
    return (
      <div className="min-h-dvh">
        <SkipLink>{t('skipToContent')}</SkipLink>
        <header className="flex h-14 items-center border-b border-border px-5">
          <Link href="/" className="press-control inline-flex min-h-11 items-center">
            <BrandLogo className="h-7 w-auto" label={t('brand')} />
          </Link>
        </header>
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    );
  }

  function renderItem(item: (typeof NAV_ITEMS)[number], layout: 'bottom' | 'side') {
    const fullLabel = t(`items.${item.id}`);
    const label = layout === 'bottom' ? t(`shortItems.${item.id}`) : fullLabel;
    const current = item.href ? isCurrent(pathname, item.href) : false;
    const shared = cn(
      'inline-flex items-center gap-1 rounded-control font-medium',
      layout === 'bottom'
        ? 'min-h-14 w-full flex-col justify-center px-1 py-1 text-xs'
        : 'min-h-11 w-full flex-row px-3 text-base',
    );

    if (!item.href) {
      return (
        <span
          aria-disabled="true"
          className={cn(shared, 'cursor-not-allowed text-fg-subtle opacity-70')}
        >
          {item.icon}
          <span>
            {label}
            <span className="sr-only"> ({t('comingSoon')})</span>
          </span>
        </span>
      );
    }

    return (
      <Link
        href={item.href}
        aria-label={fullLabel}
        aria-current={current ? 'page' : undefined}
        className={cn(
          shared,
          'press-control',
          current
            ? 'bg-primary-soft text-on-primary-soft'
            : 'text-fg-muted hover:bg-surface-strong',
        )}
      >
        {item.icon}
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <div className="min-h-dvh lg:pl-64" data-no-nav={consentPending ? 'true' : undefined}>
      <SkipLink className="lg:focus:top-2 lg:focus:left-[17rem]">{t('skipToContent')}</SkipLink>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg px-4 lg:hidden">
        <Link href="/" className="press-control inline-flex min-h-11 items-center">
          <BrandLogo className="h-7 w-auto" label={t('brand')} />
        </Link>
        {!signedIn && (
          <Link
            href="/giris"
            className="inline-flex min-h-11 items-center font-semibold text-primary"
          >
            {t('signIn')}
          </Link>
        )}
        {signedIn && (
          <NotificationBell
            initial={unreadNotifications}
            layout="header"
            refreshEnabled={canRefreshNotifications}
          />
        )}
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
        <Link href="/" className="press-control inline-flex min-h-11 items-center px-3 pt-2">
          <BrandLogo className="h-8 w-auto" label={t('brand')} />
        </Link>
        {!signedIn && (
          <Link
            href="/giris"
            className="press-control mx-3 inline-flex min-h-11 items-center font-semibold text-primary"
          >
            {t('signIn')}
          </Link>
        )}
        <nav aria-label={t('labelSide')} hidden={consentPending}>
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>{renderItem(item, 'side')}</li>
            ))}
            {signedIn && (
              <li>
                <NotificationBell
                  initial={unreadNotifications}
                  layout="side"
                  refreshEnabled={canRefreshNotifications}
                />
              </li>
            )}
            {showAdmin && (
              <li>
                <Link
                  href="/yonetim"
                  aria-current={isCurrent(pathname, '/yonetim') ? 'page' : undefined}
                  className={cn(
                    'press-control inline-flex min-h-11 w-full items-center gap-1 rounded-control px-3 text-base font-medium',
                    isCurrent(pathname, '/yonetim')
                      ? 'bg-primary-soft text-on-primary-soft'
                      : 'text-fg-muted hover:bg-surface-strong',
                  )}
                >
                  <InboxIcon />
                  {t('admin')}
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </aside>

      <KeyboardState />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'outline-none lg:pb-0',
          consentPending
            ? 'pb-[env(safe-area-inset-bottom)]'
            : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]',
        )}
      >
        {children}
      </main>

      {!consentPending && (
        <nav
          data-bottom-nav
          aria-label={t('labelBottom')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="grid grid-cols-6">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>{renderItem(item, 'bottom')}</li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
