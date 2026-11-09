import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { buildMonthlyDigest } from '@/server/services/monthly-digest';

export async function DigestView({
  digest,
}: {
  digest: Awaited<ReturnType<typeof buildMonthlyDigest>>;
}) {
  const t = await getTranslations('monthlyDigest');
  if (!digest)
    return <p className="mt-6 rounded-card border border-border p-5 text-fg-muted">{t('empty')}</p>;
  const sections = [
    digest.experiences && {
      title: t('experiences'),
      rows: digest.experiences.map((x) => ({
        id: x.id,
        label: x.label,
        href: `/deneyim/${x.id}`,
      })),
    },
    digest.jobs && {
      title: t('jobs'),
      rows: digest.jobs.map((x) => ({
        id: x.id,
        label: `${x.title} · ${x.organization}`,
        href: `/ilanlar/${x.id}`,
      })),
    },
    digest.applicationWindows && {
      title: t('windows'),
      rows: digest.applicationWindows.map((x, index) => ({
        id: String(index),
        label: x.label,
        href: '/basvuru-takvimi',
      })),
    },
    digest.events && {
      title: t('events'),
      rows: digest.events.map((x) => ({ id: x.id, label: x.label, href: '/etkinlikler' })),
    },
  ].filter((section) => section !== undefined);
  return (
    <div className="mt-6 space-y-4">
      {sections.map((section) => (
        <section
          key={section.title}
          className="rounded-card border border-border bg-surface p-5 shadow-card"
        >
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <ul className="mt-3 space-y-2">
            {section.rows.map((row) => (
              <li key={row.id}>
                <Link className="flex min-h-11 items-center text-primary underline" href={row.href}>
                  {row.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {digest.contribution && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-card">
          <h2 className="text-lg font-semibold">{t('contribution')}</h2>
          <p className="mt-3">{t('earned', { points: digest.contribution.earned })}</p>
          <p>{t('pending', { points: digest.contribution.pending })}</p>
        </section>
      )}
    </div>
  );
}
