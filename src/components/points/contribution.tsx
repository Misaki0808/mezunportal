'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ActionResult } from '@/contracts/result';
import type {
  ContributionOverview,
  GetMyContributionInput,
  PointEntryView,
} from '@/contracts/points';
import { Badge, Button, EmptyState } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { PointEntryRow } from './entry-row';
import { formatDate } from './format';

type Props = {
  initial: ContributionOverview;
  list: (input: GetMyContributionInput) => Promise<ActionResult<ContributionOverview>>;
};

/** Profilde katkı puanı: toplam, bekleyen, rozet ve geçmiş. Yalnız sahibi görür (sunucu zorlar). */
export function Contribution({ initial, list }: Props) {
  const t = useTranslations('points');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState<PointEntryView[]>(initial.history.items);
  const [cursor, setCursor] = useState(initial.history.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const { summary } = initial;

  async function more() {
    if (!cursor || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({ cursor });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((old) => [...old, ...result.data.history.items]);
      setCursor(result.data.history.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="points-title" className="flex min-w-0 flex-col gap-5">
      <div>
        <h2 id="points-title" className="text-2xl font-semibold text-fg">
          {t('title')}
        </h2>
        <p className="mt-1 text-base text-fg-muted">{t('description')}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border p-4">
          <dt className="text-sm font-medium text-fg-muted">{t('total')}</dt>
          <dd className="mt-1 text-3xl font-semibold text-fg">{summary.total}</dd>
        </div>
        <div className="rounded-card border border-border p-4">
          <dt className="text-sm font-medium text-fg-muted">{t('pending')}</dt>
          <dd className="mt-1 text-3xl font-semibold text-fg">{summary.pending}</dd>
        </div>
      </dl>
      {summary.pending > 0 && <p className="text-sm text-fg-muted">{t('pendingHint')}</p>}
      {summary.badges.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('badges')}>
          {summary.badges.map((badge) => (
            <li key={badge.kind} className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{t(`badge.${badge.kind}`)}</Badge>
              <span className="text-sm text-fg-muted">
                {t('badgeSince', { date: formatDate(badge.awardedAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <h3 className="text-lg font-semibold text-fg">{t('history')}</h3>
        {items.length === 0 ? (
          <EmptyState title={t('empty')} description={t('emptyDescription')} />
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {items.map((entry) => (
              <li key={entry.id} className="py-3">
                <PointEntryRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {errors(error)}
          </p>
        )}
        {cursor && (
          <Button
            className="mt-4"
            variant="secondary"
            loading={pending}
            onClick={() => void more()}
          >
            {t('more')}
          </Button>
        )}
      </div>
    </section>
  );
}
