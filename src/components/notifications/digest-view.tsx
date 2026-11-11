import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  BriefcaseIcon,
  buttonClasses,
  CalendarIcon,
  Card,
  ChevronRightIcon,
  EmptyState,
  IconChip,
  InboxIcon,
} from '@/components/ui';
import type { buildMonthlyDigest } from '@/server/services/monthly-digest';

export async function DigestView({
  digest,
}: {
  digest: Awaited<ReturnType<typeof buildMonthlyDigest>>;
}) {
  const t = await getTranslations('monthlyDigest');
  if (!digest)
    return (
      <EmptyState
        className="mt-6 rounded-card border border-dashed border-border"
        icon={<InboxIcon width={32} height={32} strokeWidth={1.5} />}
        title={t('empty')}
        action={
          <Link href="/deneyimler" className={buttonClasses({ variant: 'secondary' })}>
            {t('emptyAction')}
          </Link>
        }
      />
    );
  const sections = [
    digest.experiences && {
      title: t('experiences'),
      icon: <BriefcaseIcon />,
      tone: 'primary' as const,
      rows: digest.experiences.map((x) => ({
        id: x.id,
        label: x.label,
        href: `/deneyim/${x.id}`,
      })),
    },
    digest.jobs && {
      title: t('jobs'),
      icon: <BriefcaseIcon />,
      tone: 'accent' as const,
      rows: digest.jobs.map((x) => ({
        id: x.id,
        label: `${x.title} · ${x.organization}`,
        href: `/ilanlar/${x.id}`,
      })),
    },
    digest.applicationWindows && {
      title: t('windows'),
      icon: <CalendarIcon />,
      tone: 'success' as const,
      rows: digest.applicationWindows.map((x, index) => ({
        id: String(index),
        label: x.label,
        href: '/basvuru-takvimi',
      })),
    },
    digest.events && {
      title: t('events'),
      icon: <CalendarIcon />,
      tone: 'primary' as const,
      rows: digest.events.map((x) => ({ id: x.id, label: x.label, href: '/etkinlikler' })),
    },
  ].filter((section) => section !== undefined);
  return (
    <div className="mt-6 space-y-4">
      {sections.map((section) => (
        <Card as="section" key={section.title}>
          <h2 className="flex items-center gap-3 text-lg font-semibold">
            <IconChip tone={section.tone}>{section.icon}</IconChip>
            {section.title}
          </h2>
          <ul className="mt-3 space-y-1">
            {section.rows.map((row) => (
              <li key={row.id}>
                <Link
                  className="press-row flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-control px-3 py-2 text-fg hover:bg-primary-soft [overflow-wrap:anywhere]"
                  href={row.href}
                >
                  <span className="min-w-0">{row.label}</span>
                  <ChevronRightIcon className="shrink-0 text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {digest.contribution && (
        <Card as="section">
          <h2 className="text-lg font-semibold">{t('contribution')}</h2>
          <p className="mt-3">{t('earned', { points: digest.contribution.earned })}</p>
          <p className="text-fg-muted">{t('pending', { points: digest.contribution.pending })}</p>
        </Card>
      )}
    </div>
  );
}
