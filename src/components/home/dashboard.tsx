import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  BriefcaseIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from '@/components/ui';
import type { HomeSummary } from '@/contracts/home';

type ShortcutKey = 'search' | 'mentors' | 'cvReview' | 'cvInbox' | 'write' | 'profile';
type Shortcut = { key: ShortcutKey; href: string; icon: ReactNode };

const ICON_PROPS = { width: 28, height: 28, strokeWidth: 1.75 } as const;

/** Rol bazlı büyük kısayollar (3–4). SSS ekranı main'e girince "faq" kısayolu eklenir; randevu için aynı. */
const SHORTCUTS: Record<HomeSummary['role'], readonly Shortcut[]> = {
  STUDENT: [
    { key: 'search', href: '/deneyimler', icon: <BriefcaseIcon {...ICON_PROPS} /> },
    { key: 'mentors', href: '/mentorlar', icon: <UsersIcon {...ICON_PROPS} /> },
    { key: 'cvReview', href: '/hesap/cv-inceleme', icon: <FileTextIcon {...ICON_PROPS} /> },
    { key: 'write', href: '/deneyim/yeni', icon: <ClipboardCheckIcon {...ICON_PROPS} /> },
  ],
  MENTOR: [
    { key: 'search', href: '/deneyimler', icon: <BriefcaseIcon {...ICON_PROPS} /> },
    { key: 'cvInbox', href: '/hesap/cv-inceleme', icon: <FileTextIcon {...ICON_PROPS} /> },
    { key: 'write', href: '/deneyim/yeni', icon: <ClipboardCheckIcon {...ICON_PROPS} /> },
    { key: 'profile', href: '/profil', icon: <UserIcon {...ICON_PROPS} /> },
  ],
};

const PENDING_LINKS = [
  { key: 'contactRequests', href: '/hesap/iletisim' },
  { key: 'cvReviewsToAnswer', href: '/hesap/cv-inceleme' },
  { key: 'cvReviewsToRate', href: '/hesap/cv-inceleme' },
  { key: 'feedbackForms', href: '/hesap/gorusmeler' },
] as const;

/**
 * Girişli, doğrulanmış kullanıcının kişisel panosu: karşılama, bekleyen işler (yalnız sıfırdan büyükler), büyük kısayollar
 * ve yöneticiye "Yönetim". Sayılar sunucudan gelir (`getHomeSummary`); bileşen yalnız çizer.
 */
export function HomeDashboard({ summary }: { summary: HomeSummary }) {
  const t = useTranslations('home');
  const pending = PENDING_LINKS.map((item) => ({
    ...item,
    count: summary.pending[item.key],
  })).filter((item) => item.count > 0);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        {summary.firstName ? t('greeting', { name: summary.firstName }) : t('greetingPlain')}
      </h1>

      <section aria-labelledby="home-pending" className="flex flex-col gap-3">
        <h2 id="home-pending" className="text-xl font-semibold">
          {t('pendingTitle')}
        </h2>
        {pending.length === 0 ? (
          <p className="text-base text-fg-muted">{t('pendingNone')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="press-row flex min-h-14 items-center justify-between gap-3 rounded-card border border-border px-4 py-3 shadow-card"
                >
                  <span className="text-base font-medium text-fg">
                    {t(`pending.${item.key}`, { count: item.count })}
                  </span>
                  <span aria-hidden="true" className="text-primary">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="home-shortcuts" className="flex flex-col gap-3">
        <h2 id="home-shortcuts" className="text-xl font-semibold">
          {t('shortcutsTitle')}
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {SHORTCUTS[summary.role].map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="press-row flex h-full min-h-32 flex-col gap-2 rounded-card border border-border p-4 shadow-card"
              >
                <span className="text-primary">{item.icon}</span>
                <span className="text-lg font-semibold text-fg">
                  {t(`shortcuts.${item.key}.title`)}
                </span>
                <span className="text-base text-fg-muted">
                  {t(`shortcuts.${item.key}.description`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {summary.adminPending !== null && (
        <Link
          href="/yonetim"
          className="press-row flex min-h-16 items-center justify-between gap-3 rounded-card border border-primary bg-primary-soft px-4 py-3 text-on-primary-soft"
        >
          <span className="flex items-center gap-3">
            <ShieldCheckIcon {...ICON_PROPS} />
            <span className="flex flex-col">
              <span className="text-lg font-semibold">{t('admin.title')}</span>
              <span className="text-base">
                {summary.adminPending > 0
                  ? t('admin.pending', { count: summary.adminPending })
                  : t('admin.none')}
              </span>
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </>
  );
}
