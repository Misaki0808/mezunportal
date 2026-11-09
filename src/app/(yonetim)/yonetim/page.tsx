import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { hasAdminAccess } from '@/components/layout/admin-access';
import {
  BadgeCheckIcon,
  ClipboardCheckIcon,
  ErrorState,
  FileTextIcon,
  IconChip,
  PageHeader,
  ShieldCheckIcon,
  UsersIcon,
} from '@/components/ui';
import { getAdminOverview } from '@/server/actions/admin';

export const dynamic = 'force-dynamic';
export default async function AdminOverviewPage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const overview = await getAdminOverview().catch(() => null);
  if (!overview) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!overview.ok) return <ErrorState errorCode={overview.errorCode} />;
  const t = await getTranslations('admin');
  const digest = await getTranslations('monthlyDigest');
  const { capabilities } = overview.data;
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
    { key: 'auditLog', href: '/yonetim/islem-kaydi', visible: capabilities.auditLog },
    { key: 'documents', href: '/yonetim/belge-kuyrugu', visible: true },
    { key: 'experiences', href: '/yonetim/deneyimler', visible: true },
    { key: 'faq', href: '/yonetim/sss', visible: true },
    { key: 'jobPostings', href: '/yonetim/ilanlar', visible: true },
    { key: 'referrals', href: '/yonetim/referanslar', visible: true },
    { key: 'yearAlumni', href: '/yonetim/yilin-mezunu', visible: true },
    { key: 'alumniStory', href: '/yonetim/ayin-mezunu', visible: true },
  ] as const;
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
    invitations: 'accent',
    adminGrants: 'accent',
    points: 'accent',
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
    invitations: <UsersIcon width={22} height={22} />,
    adminGrants: <ShieldCheckIcon width={22} height={22} />,
    points: <BadgeCheckIcon width={22} height={22} />,
  } as const;
  return (
    <div className="mx-auto max-w-4xl px-5 pb-12 pt-10 sm:pt-14">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <Link
        href="/yonetim/aylik-ozet"
        className="press-row mt-6 flex min-h-14 items-center rounded-card border border-border p-4 font-semibold"
      >
        {digest('adminPreview')} →
      </Link>
      <ul className="mt-7 grid gap-3 sm:grid-cols-2">
        {links
          .filter((link) => link.visible)
          .map((link) => (
            <li key={link.key}>
              <Link
                href={link.href}
                className="press-row flex min-h-24 items-center gap-4 rounded-card border border-border px-4 py-4 shadow-card"
              >
                <IconChip tone={TONE[link.key]}>{ICON[link.key]}</IconChip>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold text-fg">
                    {t(`sections.${link.key}`)} →
                  </span>
                  <span className="mt-1 block text-base text-fg-muted">
                    {t(`intro.${link.key}`)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
