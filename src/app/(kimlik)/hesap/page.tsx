import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { hasAdminAccess } from '@/components/layout/admin-access';
import {
  BadgeCheckIcon,
  ErrorState,
  FileTextIcon,
  InboxIcon,
  LogOutIcon,
  MailIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@/components/ui';
import { PrivacyAccountLinks } from '@/components/privacy/account-links';
import { getVerificationState } from '@/server/actions/auth';
import { requireUser } from '@/server/permissions';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const actor = await requireUser().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_UNAUTHENTICATED" />;
  const [state, showAdmin, t, verification, entry] = await Promise.all([
    getVerificationState().catch(() => null),
    hasAdminAccess(),
    getTranslations('authScreens.account'),
    getTranslations('authScreens.verification'),
    getTranslations('experiences.entry'),
  ]);
  if (!state) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!state.ok) return <ErrorState errorCode={state.errorCode} />;
  const statusLabel = {
    VERIFIED: verification('verified'),
    NOT_STARTED: verification('notStarted'),
    AWAITING_REVIEW: verification('awaiting'),
    REJECTED: verification('rejected'),
  }[state.data.status];
  const links = [
    {
      href: '/profil',
      title: t('profile'),
      description: t('profileDescription'),
      icon: UserIcon,
    },
    {
      href: '/dogrulama',
      title: t('verification'),
      description: statusLabel,
      icon: BadgeCheckIcon,
    },
    ...(state.data.status === 'VERIFIED'
      ? [
          {
            href: '/deneyimlerim',
            title: entry('mine'),
            description: entry('mineDescription'),
            icon: FileTextIcon,
          },
        ]
      : []),
    {
      href: '/hesap/e-posta',
      title: t('email'),
      description: t('emailDescription'),
      icon: MailIcon,
    },
    ...(showAdmin
      ? [
          {
            href: '/yonetim/belge-kuyrugu',
            title: t('admin'),
            description: t('adminDescription'),
            icon: InboxIcon,
          },
          {
            href: '/yonetim/deneyimler',
            title: entry('moderation'),
            description: entry('moderationDescription'),
            icon: ShieldCheckIcon,
          },
        ]
      : []),
  ];
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
      <p className="mb-2 text-base font-semibold text-primary">{t('eyebrow')}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      <ul className="mt-8 flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="press-row flex min-h-20 items-center justify-between gap-4 rounded-card border border-border bg-bg p-5 text-fg"
            >
              <span className="text-primary">
                <link.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{link.title}</span>
                <span className="mt-1 block text-base text-fg-muted">{link.description}</span>
              </span>
              <span aria-hidden="true" className="text-xl text-primary">
                ›
              </span>
            </Link>
          </li>
        ))}
        <PrivacyAccountLinks />
        <li>
          <Link
            href="/cikis"
            className="press-row flex min-h-20 items-center gap-4 rounded-card border border-border bg-bg p-5 text-fg"
          >
            <span className="text-primary">
              <LogOutIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">{t('signOut')}</span>
              <span className="mt-1 block text-base text-fg-muted">{t('signOutDescription')}</span>
            </span>
            <span aria-hidden="true" className="text-xl text-primary">
              ›
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
