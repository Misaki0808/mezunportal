import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/ui';
import { ReliabilityBadge } from '@/components/feedback/reliability-badge';
import { getMyReliability } from '@/server/actions/feedback';
export const dynamic = 'force-dynamic';
export default async function ReliabilityPage() {
  const [result, t] = await Promise.all([getMyReliability(), getTranslations('feedback')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const value = result.data;
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <Link className="inline-flex min-h-11 items-center text-primary" href="/hesap">
        ← {t('back')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">{t('reliability')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('reliabilityDescription')}</p>
      <section className="mt-6 rounded-card border border-border p-5">
        <ReliabilityBadge label={value.label} text={t(value.label)} />
        <p className="mt-3 text-base">
          {value.label === 'NEW'
            ? t('reasonNew', { total: value.total })
            : t('reason', { total: value.total, noShow: value.noShow })}
        </p>
      </section>
    </main>
  );
}
