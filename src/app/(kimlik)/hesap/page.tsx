import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { hasAdminAccess } from '@/components/layout/admin-access';
import {
  BadgeCheckIcon,
  CalendarIcon,
  ErrorState,
  FileTextIcon,
  IconChip,
  InboxIcon,
  LogOutIcon,
  MailIcon,
  PageHeader,
  ShieldCheckIcon,
  UserIcon,
} from '@/components/ui';
import { PrivacyAccountLinks } from '@/components/privacy/account-links';
import { getVerificationState } from '@/server/actions/auth';
import { getMyMentorSettings } from '@/server/actions/appointment';
import { requireUser } from '@/server/permissions';
import { evaluateAccess } from '@/server/rules/authorization';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const actor = await requireUser().catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_UNAUTHENTICATED" />;
  const [
    state,
    showAdmin,
    t,
    verification,
    entry,
    notifications,
    feedback,
    cvReview,
    metrics,
    faq,
    appointments,
    mentor,
    seekers,
  ] = await Promise.all([
    getVerificationState().catch(() => null),
    hasAdminAccess(),
    getTranslations('authScreens.account'),
    getTranslations('authScreens.verification'),
    getTranslations('experiences.entry'),
    getTranslations('notifications'),
    getTranslations('feedback'),
    getTranslations('cvReview'),
    getTranslations('admin.metrics'),
    getTranslations('faq.entry'),
    getTranslations('appointments.account'),
    getMyMentorSettings().catch(() => null),
    getTranslations('seekers'),
  ]);
  if (!state) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!state.ok) return <ErrorState errorCode={state.errorCode} />;
  const canAskFaq = actor.facts.memberships.some(
    (membership) =>
      membership.role === 'STUDENT' &&
      membership.verificationStatus === 'VERIFIED' &&
      membership.endedAt === null,
  );
  const canAnswerFaq = evaluateAccess(actor.facts, { action: 'mentorAct' }).allowed;
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
    ...(canAskFaq
      ? [
          {
            href: '/hesap/staj-ariyorum',
            title: seekers('accountTitle'),
            description: seekers('accountDescription'),
            icon: UserIcon,
          },
        ]
      : []),
    ...(actor.facts.memberships.some(
      (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
    )
      ? [
          {
            href: '/adaylar',
            title: seekers('searchAccountTitle'),
            description: seekers('searchAccountDescription'),
            icon: InboxIcon,
          },
        ]
      : []),
    ...(state.data.status === 'VERIFIED'
      ? [
          {
            href: '/randevular',
            title: appointments('title'),
            description: appointments('description'),
            icon: CalendarIcon,
          },
          ...(mentor?.ok && mentor.data.eligible
            ? [
                {
                  href: '/mentor/ayarlar',
                  title: appointments('settingsTitle'),
                  description: appointments('settingsDescription'),
                  icon: CalendarIcon,
                },
              ]
            : []),
        ]
      : []),
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
    ...(state.data.status === 'VERIFIED'
      ? [
          {
            href: '/hesap/gorusmeler',
            title: feedback('pendingTitle'),
            description: feedback('description'),
            icon: InboxIcon,
          },
        ]
      : []),
    ...(actor.facts.memberships.some(
      (m) => m.role === 'STUDENT' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
    )
      ? [
          {
            href: '/hesap/guvenilirlik',
            title: feedback('reliability'),
            description: feedback('reliabilityDescription'),
            icon: BadgeCheckIcon,
          },
        ]
      : []),
    ...(state.data.status === 'VERIFIED'
      ? [
          {
            href: '/hesap/cv-inceleme',
            title: cvReview('title'),
            description: cvReview('accountDescription'),
            icon: FileTextIcon,
          },
        ]
      : []),
    ...(state.data.status === 'VERIFIED'
      ? [
          {
            href: '/sss',
            title: faq('browse'),
            description: faq('browseDescription'),
            icon: InboxIcon,
          },
          ...(canAskFaq
            ? [
                {
                  href: '/hesap/sss',
                  title: faq('mine'),
                  description: faq('mineDescription'),
                  icon: FileTextIcon,
                },
              ]
            : []),
          ...(canAnswerFaq
            ? [
                {
                  href: '/mentor/sss',
                  title: faq('mentor'),
                  description: faq('mentorDescription'),
                  icon: FileTextIcon,
                },
              ]
            : []),
        ]
      : []),
    {
      href: '/hesap/bildirimler',
      title: notifications('accountTitle'),
      description: notifications('accountDescription'),
      icon: MailIcon,
    },
    {
      href: '/hesap/e-posta',
      title: t('email'),
      description: t('emailDescription'),
      icon: MailIcon,
    },
    ...(showAdmin
      ? [
          {
            href: '/yonetim/kullanim',
            title: metrics('accountTitle'),
            description: metrics('accountDescription'),
            icon: InboxIcon,
          },
          {
            href: '/yonetim',
            title: t('admin'),
            description: t('adminDescription'),
            icon: InboxIcon,
          },
          {
            href: '/yonetim/sss',
            title: faq('moderation'),
            description: faq('moderationDescription'),
            icon: ShieldCheckIcon,
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
  // Gruplar: hub 17'ye kadar kart içerebilir; başlıklı bölümlere ayrılır (tarama kolaylığı). Sıra grup içinde korunur.
  const GROUPS = [
    { key: 'profile', tone: 'primary', hrefs: ['/profil', '/dogrulama'] },
    {
      key: 'activity',
      tone: 'accent',
      hrefs: [
        '/randevular',
        '/adaylar',
        '/hesap/staj-ariyorum',
        '/mentor/ayarlar',
        '/deneyimlerim',
        '/hesap/gorusmeler',
        '/hesap/guvenilirlik',
        '/hesap/cv-inceleme',
        '/sss',
        '/hesap/sss',
        '/mentor/sss',
      ],
    },
    { key: 'settings', tone: 'success', hrefs: ['/hesap/bildirimler', '/hesap/e-posta'] },
    {
      key: 'admin',
      tone: 'primary',
      hrefs: ['/yonetim/kullanim', '/yonetim', '/yonetim/sss', '/yonetim/deneyimler'],
    },
  ] as const;
  // Gruba yazılmamış bağlantı (ör. yeni eklenen sayfa) sessizce düşmez: "Görüşmeler ve içerikler" grubunda görünür.
  const groupOf = (href: string) =>
    GROUPS.find((group) => (group.hrefs as readonly string[]).includes(href)) ?? GROUPS[1];
  const linkClasses =
    'press-row flex min-h-20 items-center gap-4 rounded-card border border-border bg-bg p-4 text-fg';
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {GROUPS.map((group) => {
        const items = links.filter((link) => groupOf(link.href)?.key === group.key);
        const showPrivacy = group.key === 'settings';
        if (items.length === 0 && !showPrivacy) return null;
        return (
          <section key={group.key} aria-labelledby={`account-${group.key}`} className="mt-8">
            <h2
              id={`account-${group.key}`}
              className="text-sm font-semibold tracking-wider text-fg-muted"
            >
              {t(`groups.${group.key}`)}
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {items.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClasses}>
                    <IconChip tone={group.tone}>
                      <link.icon />
                    </IconChip>
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
              {showPrivacy && <PrivacyAccountLinks />}
            </ul>
          </section>
        );
      })}
      <section aria-labelledby="account-session" className="mt-8">
        <h2 id="account-session" className="text-sm font-semibold tracking-wider text-fg-muted">
          {t('groups.session')}
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          <li>
            <Link href="/cikis" className={linkClasses}>
              <IconChip tone="accent">
                <LogOutIcon />
              </IconChip>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{t('signOut')}</span>
                <span className="mt-1 block text-base text-fg-muted">
                  {t('signOutDescription')}
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-primary">
                ›
              </span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
