import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { hasAdminAccess } from '@/components/layout/admin-access';
import { ErrorState, PageHeader } from '@/components/ui';
import { getAdminOverview } from '@/server/actions/admin';

export const dynamic = 'force-dynamic';
export default async function AdminOverviewPage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const overview = await getAdminOverview().catch(() => null);
  if (!overview) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!overview.ok) return <ErrorState errorCode={overview.errorCode} />;
  const t = await getTranslations('admin');
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
  ] as const;
  return (
    <div className="mx-auto max-w-4xl px-5 pb-12 pt-10 sm:pt-14">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <ul className="mt-7 grid gap-3 sm:grid-cols-2">
        {links
          .filter((link) => link.visible)
          .map((link) => (
            <li key={link.key}>
              <Link
                href={link.href}
                className="press-row flex min-h-24 flex-col justify-center rounded-card border border-border px-5 py-4 shadow-card"
              >
                <span className="text-lg font-semibold text-fg">{t(`sections.${link.key}`)} →</span>
                <span className="mt-1 text-base text-fg-muted">{t(`intro.${link.key}`)}</span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
