import { getTranslations } from 'next-intl/server';
import { AccountFrame } from '@/components/account/account-frame';
import { ErrorState } from '@/components/ui';
import { ReliabilityBadge } from '@/components/feedback/reliability-badge';
import { getMyReliability } from '@/server/actions/feedback';
export const dynamic = 'force-dynamic';
export default async function ReliabilityPage() {
  const [result, t] = await Promise.all([getMyReliability(), getTranslations('feedback')]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const value = result.data;
  return (
    <AccountFrame
      title={t('reliability')}
      description={t('reliabilityDescription')}
      backLabel={t('back')}
      width="max-w-2xl"
    >
      <section className="rounded-card border border-border bg-surface p-5 shadow-card">
        <ReliabilityBadge label={value.label} text={t(value.label)} />
        <p className="mt-3 text-base">
          {value.label === 'NEW'
            ? t('reasonNew', { total: value.total })
            : t('reason', { total: value.total, noShow: value.noShow })}
        </p>
      </section>
    </AccountFrame>
  );
}
