import { getTranslations } from 'next-intl/server';

import { hasAdminAccess } from '@/components/layout/admin-access';
import {
  BadgeCheckIcon,
  BriefcaseIcon,
  CalendarIcon,
  ErrorState,
  FileTextIcon,
  InboxIcon,
  LogOutIcon,
  MailIcon,
  PageHeader,
  ShieldCheckIcon,
  UserIcon,
} from '@/components/ui';
import { AccountLink } from '@/components/account/account-link';
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
    jobs,
    referrals,
    awards,
    alumniStory,
    courseGuide,
    campusEvents,
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
    getTranslations('jobs'),
    getTranslations('referrals'),
    getTranslations('yearAlumni'),
    getTranslations('alumniStory'),
    getTranslations('courseGuide'),
    getTranslations('campusEvents'),
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
    ...(actor.facts.memberships.some(
      (m) => m.role === 'STUDENT' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
    )
      ? [
          {
            href: '/ders-rehberi',
            title: courseGuide('accountStudent'),
            description: courseGuide('accountStudentDescription'),
            icon: FileTextIcon,
          },
        ]
      : []),
    ...(actor.facts.memberships.some(
      (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
    )
      ? [
          {
            href: '/profil/dersler',
            title: courseGuide('accountAlumni'),
            description: courseGuide('accountAlumniDescription'),
            icon: FileTextIcon,
          },
        ]
      : []),
    ...(actor.facts.memberships.some(
      (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
    )
      ? [
          {
            href: '/hesap/hikayem',
            title: alumniStory('share'),
            description: alumniStory('shareDescription'),
            icon: FileTextIcon,
          },
        ]
      : []),
    ...(actor.facts.memberships.some(
      (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
    )
      ? [
          {
            href: '/odullerim',
            title: awards('awardLink'),
            description: awards('awardDescription'),
            icon: BadgeCheckIcon,
          },
        ]
      : []),
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
          {
            href: '/etkinlikler',
            title: campusEvents('title'),
            description: campusEvents('description'),
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
    ...(actor.facts.memberships.some(
      (m) =>
        (m.role === 'ALUMNI' || m.role === 'ACADEMIC') &&
        m.verificationStatus === 'VERIFIED' &&
        m.endedAt === null,
    )
      ? [
          {
            href: '/ilanlarim',
            title: jobs('mine'),
            description: jobs('mineDescription'),
            icon: BriefcaseIcon,
          },
        ]
      : []),
    ...(state.data.status === 'VERIFIED'
      ? [
          {
            href: '/hesap/referanslar',
            title: referrals('title'),
            description: referrals('accountDescription'),
            icon: FileTextIcon,
          },
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
            href: '/yonetim/dersler',
            title: courseGuide('adminTitle'),
            description: courseGuide('adminDescription'),
            icon: ShieldCheckIcon,
          },
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
  // Gruplar: hub 17'ye kadar bağlantı içerebilir; amaca göre başlıklı bölümlere ayrılır (tarama kolaylığı). Sıra grup içinde korunur.
  // "Gizlilik ve veriler" bağlantıları ayrı bileşenden gelir (PrivacyAccountLinks); yönetim yalnız yetkili kullanıcıda dolu olur.
  const GROUPS = [
    {
      key: 'profile',
      tone: 'primary',
      hrefs: ['/profil', '/dogrulama', '/ders-rehberi', '/profil/dersler'],
    },
    {
      key: 'meetings',
      tone: 'accent',
      hrefs: [
        '/randevular',
        '/mentor/ayarlar',
        '/hesap/gorusmeler',
        '/hesap/guvenilirlik',
        '/etkinlikler',
      ],
    },
    {
      key: 'career',
      tone: 'success',
      hrefs: [
        '/hesap/staj-ariyorum',
        '/adaylar',
        '/ilanlarim',
        '/hesap/referanslar',
        '/hesap/cv-inceleme',
      ],
    },
    {
      key: 'content',
      tone: 'primary',
      hrefs: ['/deneyimlerim', '/hesap/hikayem', '/odullerim', '/sss', '/hesap/sss', '/mentor/sss'],
    },
    { key: 'notifications', tone: 'accent', hrefs: ['/hesap/bildirimler', '/hesap/e-posta'] },
    { key: 'privacy', tone: 'success', hrefs: [] },
    {
      key: 'admin',
      tone: 'primary',
      hrefs: [
        '/yonetim/kullanim',
        '/yonetim',
        '/yonetim/sss',
        '/yonetim/deneyimler',
        '/yonetim/dersler',
      ],
    },
  ] as const;
  // Gruba yazılmamış bağlantı (ör. yeni eklenen sayfa) sessizce düşmez: "Yazdıklarım ve sorular" grubunda görünür.
  const FALLBACK_GROUP = 'content';
  const groupOf = (href: string) =>
    GROUPS.find((group) => (group.hrefs as readonly string[]).includes(href))?.key ??
    FALLBACK_GROUP;
  // Telefonda grup tek çerçeveli, bölücülü liste (15 ayrı kart yerine 8 sakin blok); geniş ekranda iki sütun ayrı kart.
  const listClasses =
    'mt-3 divide-y divide-border overflow-hidden rounded-card border border-border md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0';
  const headingClasses = 'text-sm font-semibold tracking-wider text-fg-muted';
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-16">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {GROUPS.map((group) => {
        const items = links.filter((link) => groupOf(link.href) === group.key);
        const showPrivacy = group.key === 'privacy';
        if (items.length === 0 && !showPrivacy) return null;
        return (
          <section key={group.key} aria-labelledby={`account-${group.key}`} className="mt-8">
            <h2 id={`account-${group.key}`} className={headingClasses}>
              {t(`groups.${group.key}`)}
            </h2>
            <ul className={listClasses}>
              {items.map((link) => (
                <li key={link.href}>
                  <AccountLink
                    href={link.href}
                    title={link.title}
                    description={link.description}
                    icon={link.icon}
                    tone={group.tone}
                  />
                </li>
              ))}
              {showPrivacy && <PrivacyAccountLinks />}
            </ul>
          </section>
        );
      })}
      <section aria-labelledby="account-session" className="mt-8">
        <h2 id="account-session" className={headingClasses}>
          {t('groups.session')}
        </h2>
        <ul className={listClasses}>
          <li>
            <AccountLink
              href="/cikis"
              title={t('signOut')}
              description={t('signOutDescription')}
              icon={LogOutIcon}
              tone="accent"
            />
          </li>
        </ul>
      </section>
    </div>
  );
}
