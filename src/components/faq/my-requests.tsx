'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

import {
  FAQ_PAGE_HREF,
  type FaqStatus,
  type ListMyFaqRequestsInput,
  type MyFaqRequestPage,
  type MyFaqRequestView,
} from '@/contracts/faq';
import type { ActionResult } from '@/contracts/result';
import { Badge, Button, EmptyState, type BadgeTone } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { formatDate } from './format';

const TONE: Record<FaqStatus, BadgeTone> = {
  OPEN: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  REDIRECTED: 'info',
};

type Props = {
  items: MyFaqRequestView[];
  nextCursor: string | null;
  list: (input: ListMyFaqRequestsInput) => Promise<ActionResult<MyFaqRequestPage>>;
  onMore: (page: MyFaqRequestPage) => void;
};

/** Taleplerim: durum, ret gerekçesi / yönlendirme notu, yayında SSS bağlantısı, yönlendirmede mentor dizini bağlantısı. */
export function MyRequests({ items, nextCursor, list, onMore }: Props) {
  const t = useTranslations('faq.mine');
  const errors = useTranslations('errors.codes');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();

  async function more() {
    if (!nextCursor || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({ cursor: nextCursor });
      if (!result.ok) setError(result.errorCode);
      else onMore(result.data);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }

  if (items.length === 0)
    return <EmptyState title={t('empty')} description={t('emptyDescription')} />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="min-w-0 rounded-card border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[item.status]}>{t(`status.${item.status}`)}</Badge>
              <span className="text-sm text-fg-muted">{formatDate(item.createdAt)}</span>
            </div>
            <p className="mt-2 text-base font-medium text-fg [overflow-wrap:anywhere]">
              {item.question}
            </p>
            {item.status === 'REJECTED' && (
              <p className="mt-2 text-base text-fg-muted [overflow-wrap:anywhere]">
                {item.decisionNote
                  ? t('rejectedReason', { reason: item.decisionNote })
                  : t('rejectedNoReason')}
              </p>
            )}
            {item.status === 'REDIRECTED' && (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-base text-fg-muted">{t('redirectedText')}</p>
                {item.decisionNote && (
                  <p className="text-base text-fg-muted [overflow-wrap:anywhere]">
                    {t('moderatorNote', { note: item.decisionNote })}
                  </p>
                )}
                {item.directoryHref && (
                  <Link
                    className="press-row inline-flex min-h-11 items-center font-medium text-primary"
                    href={item.directoryHref}
                  >
                    {t('toDirectory')} →
                  </Link>
                )}
              </div>
            )}
            {item.status === 'PUBLISHED' && item.faqItemId && (
              <Link
                className="press-row mt-2 inline-flex min-h-11 items-center font-medium text-primary"
                href={`${FAQ_PAGE_HREF}/${item.faqItemId}`}
              >
                {t('viewPublished')} →
              </Link>
            )}
            {item.status === 'OPEN' && (
              <p className="mt-2 text-sm text-fg-muted">{t('openHint')}</p>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {nextCursor && (
        <Button variant="secondary" loading={pending} onClick={() => void more()}>
          {t('more')}
        </Button>
      )}
    </div>
  );
}
