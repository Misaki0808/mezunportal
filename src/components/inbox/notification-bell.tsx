'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { BellIcon, cn } from '@/components/ui';
import { INBOX_UNREAD_CAP } from '@/contracts/inbox';

/**
 * Bildirim girişi: okunmamış sayısı rozeti + erişilebilir ad ("Bildirimler, 3 okunmamış"). Sayı sunucudan gelir (ilk çizim); kök düzen
 * sayfa gezinmesinde yeniden çizilmediğinden rozet gezinmede ve pencere odağa dönünce küçük bir GET isteğiyle tazelenir (sunucu eylemi değildir). Canlı bağlantı yoktur.
 */
/** Bildirim kutusunda okundu işaretlenince yayılır; rozet sayısını yeniden okur. */
export const INBOX_CHANGED_EVENT = 'mezunportal:inbox-changed';

export function NotificationBell({
  initial,
  layout,
  refreshEnabled,
}: {
  initial: number;
  layout: 'header' | 'side';
  refreshEnabled: boolean;
}) {
  const t = useTranslations('inbox.bell');
  const nav = useTranslations('nav');
  const pathname = usePathname();
  // Sunucunun verdiği sayı değişince (yeni düzen çizimi) istemcinin getirdiği değer atılır; aksi halde getirilen değer geçerlidir.
  const [seen, setSeen] = useState(initial);
  const [fetched, setFetched] = useState<number | null>(null);
  if (seen !== initial) {
    setSeen(initial);
    setFetched(null);
  }
  const unread = refreshEnabled ? (fetched ?? initial) : 0;
  const first = useRef(true);

  useEffect(() => {
    if (!refreshEnabled) return;
    let alive = true;
    async function refresh() {
      try {
        const response = await fetch('/api/bildirimler/okunmamis', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const count = (body as { unread?: unknown }).unread;
        if (alive && typeof count === 'number') setFetched(count);
      } catch {
        // Rozet süs bilgidir: ağ hatası sayfayı bozmaz, bir sonraki fırsatta yenilenir.
      }
    }
    if (first.current) first.current = false;
    else void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onVisible);
    window.addEventListener(INBOX_CHANGED_EVENT, onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('focus', onVisible);
      window.removeEventListener(INBOX_CHANGED_EVENT, onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname, refreshEnabled]);

  const overflow = unread >= INBOX_UNREAD_CAP;
  const label = overflow
    ? t('labelMany')
    : unread > 0
      ? t('labelUnread', { count: unread })
      : t('label');
  const current = pathname === '/bildirimler';
  return (
    <Link
      href="/bildirimler"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'press-control relative inline-flex items-center rounded-control font-medium',
        layout === 'header'
          ? 'min-h-11 min-w-11 justify-center'
          : 'min-h-11 w-full gap-1 px-3 text-base',
        current ? 'bg-primary-soft text-on-primary-soft' : 'text-fg-muted hover:bg-surface-strong',
      )}
    >
      <span className="relative inline-flex">
        <BellIcon />
        {unread > 0 && layout === 'header' && (
          <span
            data-testid="bell-badge"
            aria-hidden="true"
            className="absolute -top-2 -right-2.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold leading-5 text-on-accent"
          >
            {overflow ? t('overflow') : unread}
          </span>
        )}
      </span>
      {layout === 'side' && (
        <>
          <span>{nav('items.notifications')}</span>
          {unread > 0 && (
            <span
              data-testid="bell-badge"
              aria-hidden="true"
              className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-sm font-semibold leading-6 text-on-accent"
            >
              {overflow ? t('overflow') : unread}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
