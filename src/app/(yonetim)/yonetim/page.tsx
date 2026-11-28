import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { hasAdminAccess } from '@/components/layout/admin-access';
import {
  Badge,
  EmptyState,
  ChevronRightIcon,
  BadgeCheckIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  ErrorState,
  FileTextIcon,
  IconChip,
  PageHeader,
  ShieldCheckIcon,
  UsersIcon,
} from '@/components/ui';
import { AdminList, AdminListItem } from '@/components/admin/list';
import { getAdminOverview } from '@/server/actions/admin';

export const dynamic = 'force-dynamic';
export default async function AdminOverviewPage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const overview = await getAdminOverview().catch(() => null);
  if (!overview) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!overview.ok) return <ErrorState errorCode={overview.errorCode} />;
  const t = await getTranslations('admin');
  const digest = await getTranslations('monthlyDigest');
  const campusEvents = await getTranslations('campusEvents');
  const { capabilities, counts } = overview.data;
  const links = [
    { key: 'usageMetrics', href: '/yonetim/kullanim', visible: true },
    { key: 'users', href: '/yonetim/kullanicilar', visible: capabilities.users },
    { key: 'reports', href: '/yonetim/sikayetler', visible: capabilities.reports },
    { key: 'employmentReport', href: '/yonetim/istihdam', visible: capabilities.employmentReport },
    { key: 'dictionaries', href: '/yonetim/sozlukler', visible: capabilities.dictionaries },
    {
      key: 'unmatchedValues',
      href: '/yonetim/eslesmeyenler',
      visible: capabilities.unmatchedValues,
    },
    { key: 'invitations', href: '/yonetim/davetler', visible: capabilities.dictionaries },
    { key: 'adminGrants', href: '/yonetim/yetkiler', visible: capabilities.adminGrants },
    { key: 'points', href: '/yonetim/puan', visible: capabilities.adminGrants },
    { key: 'googleCalendar', href: '/yonetim/google', visible: capabilities.adminGrants },
    { key: 'auditLog', href: '/yonetim/islem-kaydi', visible: capabilities.auditLog },
    { key: 'documents', href: '/yonetim/belge-kuyrugu', visible: true },
    { key: 'experiences', href: '/yonetim/deneyimler', visible: true },
    { key: 'faq', href: '/yonetim/sss', visible: true },
    { key: 'jobPostings', href: '/yonetim/ilanlar', visible: true },
    { key: 'referrals', href: '/yonetim/referanslar', visible: true },
    { key: 'yearAlumni', href: '/yonetim/yilin-mezunu', visible: true },
    { key: 'alumniStory', href: '/yonetim/ayin-mezunu', visible: true },
    { key: 'courses', href: '/yonetim/dersler', visible: true },
    { key: 'sessionFeedback', href: '/yonetim/gorusme-geri-bildirimleri', visible: true },
  ] as const;
  const queueCounts: Partial<Record<(typeof links)[number]['key'], number | null>> = {
    documents: counts.pendingGraduationDocuments,
    experiences: counts.pendingExperiences,
    faq: counts.pendingFaqRequests,
    jobPostings: counts.pendingJobPostings,
    referrals: counts.pendingReferrals,
    alumniStory: counts.pendingAlumniStories,
    reports: counts.openReports,
    unmatchedValues: counts.openUnmatchedValues,
  };
  // Renk dağılımı: moderasyon/kişi işleri İris, veri ve raporlar Nane, sistem ayarları Mercan (anlam taşımaz; metin asıl sinyaldir).
  const TONE = {
    users: 'primary',
    reports: 'primary',
    documents: 'primary',
    experiences: 'primary',
    faq: 'primary',
    jobPostings: 'primary',
    referrals: 'primary',
    yearAlumni: 'primary',
    alumniStory: 'primary',
    unmatchedValues: 'primary',
    usageMetrics: 'success',
    employmentReport: 'success',
    auditLog: 'success',
    dictionaries: 'accent',
    courses: 'accent',
    invitations: 'accent',
    adminGrants: 'accent',
    points: 'accent',
    googleCalendar: 'accent',
    sessionFeedback: 'primary',
  } as const;
  const ICON = {
    users: <UsersIcon width={22} height={22} />,
    reports: <ClipboardCheckIcon width={22} height={22} />,
    documents: <FileTextIcon width={22} height={22} />,
    experiences: <FileTextIcon width={22} height={22} />,
    faq: <ClipboardCheckIcon width={22} height={22} />,
    jobPostings: <ClipboardCheckIcon width={22} height={22} />,
    referrals: <ClipboardCheckIcon width={22} height={22} />,
    yearAlumni: <BadgeCheckIcon width={22} height={22} />,
    alumniStory: <BadgeCheckIcon width={22} height={22} />,
    unmatchedValues: <ClipboardCheckIcon width={22} height={22} />,
    usageMetrics: <BadgeCheckIcon width={22} height={22} />,
    employmentReport: <BadgeCheckIcon width={22} height={22} />,
    auditLog: <ShieldCheckIcon width={22} height={22} />,
    dictionaries: <FileTextIcon width={22} height={22} />,
    courses: <FileTextIcon width={22} height={22} />,
    invitations: <UsersIcon width={22} height={22} />,
    adminGrants: <ShieldCheckIcon width={22} height={22} />,
    points: <BadgeCheckIcon width={22} height={22} />,
    googleCalendar: <CalendarIcon width={22} height={22} />,
    sessionFeedback: <FileTextIcon width={22} height={22} />,
  } as const;
  const queueLinks = links.filter((link) => link.visible && link.key in queueCounts);
  const waiting = queueLinks.filter((link) => (queueCounts[link.key] ?? 0) > 0);
  const tools = [
    ...links.filter((link) => link.visible && !(link.key in queueCounts)),
    ...queueLinks.filter((link) => (queueCounts[link.key] ?? 0) === 0),
  ];
  const allClear =
    queueLinks.every((link) => queueCounts[link.key] === 0) && counts.pendingCampusEvents === 0;
  return (
    <div className="min-w-0 space-y-7">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <section aria-labelledby="admin-pending-heading" className="space-y-4">
        <h2 id="admin-pending-heading" className="text-lg font-bold">
          {t('overview.pendingTitle')}
        </h2>
        {allClear && (
          <EmptyState
            title={t('overview.clearTitle')}
            description={t('overview.clearDescription')}
            className="rounded-card border border-border bg-surface"
          />
        )}
        {(waiting.length > 0 || counts.pendingCampusEvents > 0) && (
          <AdminList>
            {waiting.map((link) => (
              <AdminListItem key={link.key} flush>
                <Link
                  href={link.href}
                  className="press-row flex min-h-20 items-center gap-4 px-4 py-4 lg:px-5"
                >
                  <IconChip tone={TONE[link.key]}>{ICON[link.key]}</IconChip>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{t(`sections.${link.key}`)}</span>
                    <span className="mt-1 block text-sm text-fg-muted">
                      {t(`intro.${link.key}`)}
                    </span>
                  </span>
                  {queueCounts[link.key] !== null && queueCounts[link.key] !== undefined && (
                    <Badge
                      tone={queueCounts[link.key]! > 0 ? 'warning' : 'neutral'}
                      className="shrink-0"
                    >
                      {t('pendingCount', { count: queueCounts[link.key]! })}
                    </Badge>
                  )}
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="hidden shrink-0 text-fg-muted sm:block"
                    width={18}
                    height={18}
                  />
                </Link>
              </AdminListItem>
            ))}
            {counts.pendingCampusEvents > 0 && (
              <AdminListItem flush>
                <Link
                  href="/yonetim/etkinlikler"
                  className="press-row flex min-h-20 items-center gap-4 px-4 py-4 lg:px-5"
                >
                  <IconChip tone="primary">
                    <CalendarIcon width={22} height={22} />
                  </IconChip>
                  <span className="min-w-0 flex-1 font-semibold">{campusEvents('adminTitle')}</span>
                  <Badge
                    tone={counts.pendingCampusEvents > 0 ? 'warning' : 'neutral'}
                    className="shrink-0"
                  >
                    {t('pendingCount', { count: counts.pendingCampusEvents })}
                  </Badge>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="hidden shrink-0 text-fg-muted sm:block"
                    width={18}
                    height={18}
                  />
                </Link>
              </AdminListItem>
            )}
          </AdminList>
        )}
      </section>
      <section aria-labelledby="admin-tools-heading" className="space-y-4">
        <h2 id="admin-tools-heading" className="text-lg font-bold">
          {t('overview.toolsTitle')}
        </h2>
        <ul className="grid gap-x-7 divide-y divide-border lg:grid-cols-2 lg:divide-y-0">
          {tools.map((link) => (
            <li key={link.key} className="min-w-0 lg:border-b lg:border-border">
              <Link href={link.href} className="press-row flex min-h-20 items-center gap-3 py-4">
                <IconChip tone={TONE[link.key]}>{ICON[link.key]}</IconChip>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t(`sections.${link.key}`)}</span>
                  <span className="mt-1 block text-sm text-fg-muted">{t(`intro.${link.key}`)}</span>
                </span>
                {queueCounts[link.key] !== null && queueCounts[link.key] !== undefined && (
                  <Badge tone="neutral">
                    {t('pendingCount', { count: queueCounts[link.key]! })}
                  </Badge>
                )}
                <ChevronRightIcon
                  aria-hidden="true"
                  width={18}
                  height={18}
                  className="shrink-0 text-fg-muted"
                />
              </Link>
            </li>
          ))}
          {counts.pendingCampusEvents === 0 && (
            <li className="min-w-0 lg:border-b lg:border-border">
              <Link
                href="/yonetim/etkinlikler"
                className="press-row flex min-h-20 items-center gap-3 py-4"
              >
                <IconChip tone="primary">
                  <CalendarIcon width={22} height={22} />
                </IconChip>
                <span className="min-w-0 flex-1 font-semibold">{campusEvents('adminTitle')}</span>
                <Badge tone="neutral">{t('pendingCount', { count: 0 })}</Badge>
                <ChevronRightIcon
                  aria-hidden="true"
                  width={18}
                  height={18}
                  className="shrink-0 text-fg-muted"
                />
              </Link>
            </li>
          )}
          <li className="min-w-0 lg:border-b lg:border-border">
            <Link
              href="/yonetim/aylik-ozet"
              className="press-row flex min-h-20 items-center gap-3 py-4"
            >
              <IconChip tone="success">
                <FileTextIcon width={22} height={22} />
              </IconChip>
              <span className="min-w-0 flex-1 font-semibold">{digest('adminPreview')}</span>
              <ChevronRightIcon
                aria-hidden="true"
                width={18}
                height={18}
                className="shrink-0 text-fg-muted"
              />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
