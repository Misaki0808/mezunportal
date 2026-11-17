'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  Avatar,
  BadgeCheckIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CalendarIcon,
  FileTextIcon,
  HomeIcon,
  InboxIcon,
  MapPinIcon,
  MenuIcon,
  SearchIcon,
  Sheet,
  SlidersIcon,
  UserIcon,
  UsersIcon,
  cn,
} from '@/components/ui';

import { NotificationBell, UnreadProvider } from '@/components/inbox/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';

import type { ShellUser } from '@/contracts/shell-user';
import { SEARCH_QUERY_MAX, SEARCH_QUERY_MIN } from '@/contracts/search';
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

type NavId =
  | 'home'
  | 'jobs'
  | 'mentors'
  | 'alumni'
  | 'appointments'
  | 'experiences'
  | 'events'
  | 'courses'
  | 'profile'
  | 'account';

/** Yalnız gerçek rotası olan öğeler (kart 384): yer tutucu ya da "yakında" öğesi yoktur. */
const MAIN_ITEMS: readonly { id: NavId; href: string; icon: ReactNode }[] = [
  { id: 'home', href: '/', icon: <HomeIcon /> },
  { id: 'jobs', href: '/ilanlar', icon: <BriefcaseIcon /> },
  { id: 'mentors', href: '/mentorlar', icon: <UsersIcon /> },
  { id: 'alumni', href: '/mezunlar', icon: <BadgeCheckIcon /> },
  { id: 'appointments', href: '/randevular', icon: <CalendarIcon /> },
  { id: 'experiences', href: '/deneyimler', icon: <FileTextIcon /> },
  { id: 'events', href: '/etkinlikler', icon: <MapPinIcon /> },
  { id: 'courses', href: '/ders-rehberi', icon: <BookOpenIcon /> },
];

/** Profilim gerçek profildir (`/profil`); hesap ayarları (`/hesap`) ayrı kalem, kullanıcı kartı ve avatardan açılır. */
const PROFILE_ITEM = { id: 'profile', href: '/profil', icon: <UserIcon /> } as const;
const ACCOUNT_ITEM = { id: 'account', href: '/hesap', icon: <SlidersIcon /> } as const;

type TabId = 'home' | 'jobs' | 'mentors' | 'appointments';

/** Telefon alt çubuğu: dört sekme + "Menü" (beşinci, alt sayfa açar; kart 387). */
const TAB_ITEMS: readonly { id: TabId; href: string; icon: ReactNode }[] = [
  { id: 'home', href: '/', icon: <HomeIcon /> },
  { id: 'jobs', href: '/ilanlar', icon: <BriefcaseIcon /> },
  { id: 'mentors', href: '/mentorlar', icon: <UsersIcon /> },
  { id: 'appointments', href: '/randevular', icon: <CalendarIcon /> },
];

/** "Menü" alt sayfasının keşfet grubu: alt çubukta yeri olmayan ekranlar (kimlik `MAIN_ITEMS` ile aynı). */
const MENU_EXPLORE_IDS: readonly NavId[] = ['experiences', 'alumni', 'events', 'courses'];
const MENU_EXPLORE = MENU_EXPLORE_IDS.flatMap((id) => MAIN_ITEMS.filter((item) => item.id === id));

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/ilanlar' && pathname === '/ilanlarim') return true;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Yan menü öğesi: lacivert zeminde; etkin öğe etkin zemin + solda 3 px mercan çizgi. */
function sideLinkClasses(current: boolean): string {
  return cn(
    'press-control inline-flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-[0.95rem] font-medium outline-side-fg',
    current
      ? 'bg-side-active text-side-fg shadow-[inset_3px_0_0_var(--color-accent)]'
      : 'text-side-muted hover:bg-side-active hover:text-side-fg',
  );
}

/**
 * Uygulama düzeni (görünüm A "Gece ve Kâğıt", docs/design.md): ≥ 1024 px'te sabit lacivert yan menü + üst çubuk,
 * altında telefon düzeni: yapışkan üst çubuk + beş sekmeli alt çubuk. Atlama bağlantısı klavye kullanıcısını gezinmenin
 * üzerinden içeriğe taşır. Oturumsuz ziyaretçi ve giriş ekranları yan menüsüz, aynı token'larla çizilir.
 */
export function AppShellClient({
  children,
  showAdmin = false,
  signedIn = false,
  consentPending = false,
  canRefreshNotifications = false,
  unreadNotifications = 0,
  shellUser = null,
}: {
  children: ReactNode;
  showAdmin?: boolean;
  signedIn?: boolean;
  /** Oturum açık ama zorunlu onay eksik: gezinme henüz kullanılamayan yerlere götürür, bu yüzden çizilmez. */
  consentPending?: boolean;
  canRefreshNotifications?: boolean;
  /** Okunmamış bildirim sayısı (üst sınırlı); yalnız oturum açıkken anlamlıdır. */
  unreadNotifications?: number;
  /** Yan menü alt kartı: oturumdaki kişinin kendi adı ve üyelik satırı; yoksa kart çizilmez. */
  shellUser?: ShellUser | null;
}) {
  const t = useTranslations('nav');
  const themeText = useTranslations('theme');
  const themeLabels = { toLight: themeText('switchToLight'), toDark: themeText('switchToDark') };
  const pathname = usePathname();
  // Telefon menüsü: açık/kapalı durumu bulunulan yola bağlıdır, sayfa değişince kendiliğinden kapanır (etki gerekmez).
  const [menu, setMenu] = useState({ open: false, path: pathname });
  const menuOpen = menu.open && menu.path === pathname;

  // Giriş tamamlandı (oturumlu bir ekran çizildi): "E-postanı kontrol et" ekranı için tutulan adres bu sekmede kalmasın.
  useEffect(() => {
    if (signedIn) forgetSignInAddress();
  }, [signedIn]);

  // Girişsiz karşılama sayfası kendi gezinmesini ve ana içeriğini sunar.
  if (!signedIn && pathname === '/') return <>{children}</>;

  // Giriş ve bağlantı kontrol ekranları ile oturumsuz ziyaretçi: yan menü yok, yalnız logo (ve girişsizse "Giriş yap").
  const authScreen = pathname === '/giris' || pathname.startsWith('/giris/');
  if (authScreen || !signedIn) {
    return (
      <div className="min-h-dvh">
        <SkipLink>{t('skipToContent')}</SkipLink>
        <header className="flex h-14 items-center justify-between border-b border-border px-5 lg:px-8">
          <Link href="/" className="press-control inline-flex min-h-11 items-center">
            <BrandLogo className="h-7 w-auto" label={t('brand')} />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle labels={themeLabels} />
            {!signedIn && !authScreen && (
              <Link
                href="/giris"
                className="press-control inline-flex min-h-11 items-center px-2 font-semibold text-primary"
              >
                {t('signIn')}
              </Link>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    );
  }

  const tools = !consentPending;

  function renderTab(item: (typeof TAB_ITEMS)[number]) {
    const current = isCurrent(pathname, item.href);
    return (
      <Link
        href={item.href}
        aria-label={t(`items.${item.id}`)}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'press-control inline-flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-control px-1 py-1 text-xs font-semibold',
          current
            ? 'bg-primary-soft text-on-primary-soft'
            : 'text-fg-muted hover:bg-surface-strong',
        )}
      >
        {item.icon}
        <span>{t(`shortItems.${item.id}`)}</span>
      </Link>
    );
  }

  const closeMenu = () => setMenu({ open: false, path: pathname });
  const menuCurrent =
    [...MENU_EXPLORE, PROFILE_ITEM, ACCOUNT_ITEM].some((item) => isCurrent(pathname, item.href)) ||
    isCurrent(pathname, '/bildirimler') ||
    (showAdmin && isCurrent(pathname, '/yonetim'));

  /** Alt çubuğun beşinci öğesi: bir sayfa değil alt sayfa açar; menüdeki bir ekran açıkken etkin görünür. */
  const menuTab = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
      aria-current={menuCurrent ? 'true' : undefined}
      onClick={() => setMenu({ open: true, path: pathname })}
      className={cn(
        'press-control inline-flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-control px-1 py-1 text-xs font-semibold',
        menuCurrent
          ? 'bg-primary-soft text-on-primary-soft'
          : 'text-fg-muted hover:bg-surface-strong',
      )}
    >
      <MenuIcon />
      <span>{t('shortItems.menu')}</span>
    </button>
  );

  function renderMenuItem(item: { id: NavId; href: string; icon: ReactNode }) {
    const current = isCurrent(pathname, item.href);
    return (
      <Link
        href={item.href}
        aria-current={current ? 'page' : undefined}
        onClick={closeMenu}
        className={cn(
          'press-control inline-flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-base font-medium',
          current ? 'bg-primary-soft text-on-primary-soft' : 'text-fg hover:bg-surface-strong',
        )}
      >
        {item.icon}
        <span>{t(`items.${item.id}`)}</span>
      </Link>
    );
  }

  function renderSideItem(item: { id: NavId; href: string; icon: ReactNode }) {
    const current = isCurrent(pathname, item.href);
    return (
      <Link
        href={item.href}
        aria-current={current ? 'page' : undefined}
        className={sideLinkClasses(current)}
      >
        {item.icon}
        <span>{t(`items.${item.id}`)}</span>
      </Link>
    );
  }

  function standingText(membership: NonNullable<ShellUser['membership']>): string | null {
    switch (membership.standing) {
      case 'GRADE':
        return t('userCard.grade', { grade: membership.grade ?? 0 });
      case 'PREPARATORY':
        return t('userCard.preparatory');
      case 'ALUMNI':
        return t('userCard.alumni');
      case 'ACADEMIC':
        return t('userCard.academic');
      default:
        return null;
    }
  }
  const membershipLine = shellUser?.membership
    ? [shellUser.membership.departmentCode, standingText(shellUser.membership)]
        .filter(Boolean)
        .join(' · ')
    : null;

  const accountAvatar = shellUser ? (
    <Link
      href="/hesap"
      aria-label={t('accountLink')}
      className="press-control inline-flex size-11 items-center justify-center rounded-full"
    >
      <Avatar src={shellUser.photoSrc} name={shellUser.name} size="sm" decorative />
    </Link>
  ) : null;

  return (
    <UnreadProvider initial={unreadNotifications} refreshEnabled={canRefreshNotifications}>
      <div className="min-h-dvh lg:pl-[15.75rem]" data-no-nav={consentPending ? 'true' : undefined}>
        <SkipLink className="lg:focus:top-2 lg:focus:left-[16.25rem]">
          {t('skipToContent')}
        </SkipLink>

        <aside className="fixed inset-y-0 left-0 hidden w-[15.75rem] flex-col gap-6 border-r border-side-line bg-side-bg px-4 py-6 text-side-fg lg:flex">
          <Link
            href="/"
            className="press-control inline-flex min-h-11 items-center px-3 outline-side-fg"
          >
            <BrandLogo className="h-8 w-auto" label={t('brand')} variant="on-dark" />
          </Link>
          <nav
            aria-label={t('labelSide')}
            hidden={consentPending}
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
          >
            <ul className="flex flex-col gap-0.5">
              {MAIN_ITEMS.map((item) => (
                <li key={item.id}>{renderSideItem(item)}</li>
              ))}
            </ul>
            <p
              id="side-group-account"
              className="px-3 pt-5 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-side-muted uppercase"
            >
              {t('groups.account')}
            </p>
            <ul aria-labelledby="side-group-account" className="flex flex-col gap-0.5">
              <li>
                <NotificationBell
                  initial={unreadNotifications}
                  layout="side"
                  refreshEnabled={canRefreshNotifications}
                />
              </li>
              <li>{renderSideItem(PROFILE_ITEM)}</li>
              <li>{renderSideItem(ACCOUNT_ITEM)}</li>
            </ul>
            {showAdmin && (
              <>
                <p
                  id="side-group-admin"
                  className="px-3 pt-5 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-side-muted uppercase"
                >
                  {t('groups.admin')}
                </p>
                <ul aria-labelledby="side-group-admin" className="flex flex-col gap-0.5">
                  <li>
                    <Link
                      href="/yonetim"
                      aria-current={isCurrent(pathname, '/yonetim') ? 'page' : undefined}
                      className={sideLinkClasses(isCurrent(pathname, '/yonetim'))}
                    >
                      <InboxIcon />
                      <span>{t('admin')}</span>
                    </Link>
                  </li>
                </ul>
              </>
            )}
          </nav>
          {shellUser && !consentPending && (
            <Link
              href="/hesap"
              aria-label={t('userCard.link', { name: shellUser.name })}
              aria-current={isCurrent(pathname, '/hesap') ? 'page' : undefined}
              className="press-control flex items-center gap-3 rounded-control bg-side-foot p-3 outline-side-fg hover:bg-side-active"
            >
              <Avatar src={shellUser.photoSrc} name={shellUser.name} size="sm" decorative />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-side-fg">{shellUser.name}</p>
                {membershipLine && (
                  <p className="truncate text-xs text-side-muted">{membershipLine}</p>
                )}
              </div>
            </Link>
          )}
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-bg px-4 py-1 lg:hidden">
            <Link href="/" className="press-control inline-flex min-h-11 items-center">
              <BrandLogo className="h-7 w-auto" label={t('brand')} />
            </Link>
            <div className="flex items-center gap-1">
              {/* Tema düğmesi onay beklerken de görünür (görünüm tercihi onaya bağlı değildir). */}
              <ThemeToggle labels={themeLabels} />
              {tools && (
                <>
                  <NotificationBell
                    initial={unreadNotifications}
                    layout="header"
                    refreshEnabled={canRefreshNotifications}
                  />
                  {accountAvatar}
                </>
              )}
            </div>
          </header>

          <header className="sticky top-0 z-30 hidden h-[4.5rem] items-center gap-3.5 border-b border-border bg-bg px-8 lg:flex">
            {tools && (
              <form
                role="search"
                action="/deneyimler"
                method="get"
                className="relative w-full max-w-[28.75rem]"
              >
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
                <input
                  type="search"
                  name="q"
                  aria-label={t('search.label')}
                  placeholder={t('search.placeholder')}
                  minLength={SEARCH_QUERY_MIN}
                  maxLength={SEARCH_QUERY_MAX}
                  autoComplete="off"
                  className="block min-h-11 w-full rounded-control border border-border-control bg-surface py-2 pr-3 pl-10 text-[0.9375rem] text-fg placeholder:text-fg-subtle"
                />
              </form>
            )}
            <div className="ml-auto flex items-center gap-3">
              {/* Tema düğmesi onay beklerken de görünür (görünüm tercihi onaya bağlı değildir). */}
              <ThemeToggle labels={themeLabels} className="border border-border bg-surface" />
              {tools && (
                <>
                  <NotificationBell
                    initial={unreadNotifications}
                    layout="icon"
                    refreshEnabled={canRefreshNotifications}
                  />
                  {accountAvatar}
                </>
              )}
            </div>
          </header>

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
            <div className="app-content w-full max-w-[80rem] px-4 pt-4 pb-6 lg:px-8 lg:pt-7 lg:pb-10">
              {children}
            </div>
          </main>
        </div>

        {!consentPending && (
          <nav
            data-bottom-nav
            aria-label={t('labelBottom')}
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
          >
            <ul className="grid grid-cols-5 gap-0.5 px-1 pt-1">
              {TAB_ITEMS.map((item) => (
                <li key={item.id}>{renderTab(item)}</li>
              ))}
              <li>{menuTab}</li>
            </ul>
          </nav>
        )}

        {!consentPending && (
          <Sheet open={menuOpen} onClose={closeMenu} title={t('menu.title')}>
            <nav aria-label={t('menu.title')} className="flex flex-col gap-5">
              <div>
                <p
                  id="menu-group-explore"
                  className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase"
                >
                  {t('groups.explore')}
                </p>
                <ul aria-labelledby="menu-group-explore" className="flex flex-col gap-0.5">
                  {MENU_EXPLORE.map((item) => (
                    <li key={item.id}>{renderMenuItem(item)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p
                  id="menu-group-account"
                  className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase"
                >
                  {t('groups.account')}
                </p>
                <ul aria-labelledby="menu-group-account" className="flex flex-col gap-0.5">
                  <li>
                    <NotificationBell
                      initial={unreadNotifications}
                      layout="row"
                      refreshEnabled={canRefreshNotifications}
                      onNavigate={closeMenu}
                    />
                  </li>
                  <li>{renderMenuItem(PROFILE_ITEM)}</li>
                  <li>{renderMenuItem(ACCOUNT_ITEM)}</li>
                </ul>
              </div>
              {showAdmin && (
                <div>
                  <p
                    id="menu-group-admin"
                    className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase"
                  >
                    {t('groups.admin')}
                  </p>
                  <ul aria-labelledby="menu-group-admin" className="flex flex-col gap-0.5">
                    <li>
                      <Link
                        href="/yonetim"
                        aria-current={isCurrent(pathname, '/yonetim') ? 'page' : undefined}
                        onClick={closeMenu}
                        className={cn(
                          'press-control inline-flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-base font-medium',
                          isCurrent(pathname, '/yonetim')
                            ? 'bg-primary-soft text-on-primary-soft'
                            : 'text-fg hover:bg-surface-strong',
                        )}
                      >
                        <InboxIcon />
                        <span>{t('admin')}</span>
                      </Link>
                    </li>
                  </ul>
                </div>
              )}
            </nav>
          </Sheet>
        )}
      </div>
    </UnreadProvider>
  );
}
