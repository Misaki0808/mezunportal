'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';

import {
  EXPERIENCE_STATUSES,
  type ExperiencePage,
  type ListMyExperiencesInput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import { Badge, Button, buttonClasses, EmptyState, Tabs } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { StatusBadge } from './status-badge';

type Status = (typeof EXPERIENCE_STATUSES)[number];
type Filter = 'ALL' | Status;
type Props = {
  initial: ExperiencePage;
  list: (input: ListMyExperiencesInput) => Promise<ActionResult<ExperiencePage>>;
};

export function MyExperiences({ initial, list }: Props) {
  const t = useTranslations('experiences');
  const errors = useTranslations('errors.codes');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);

  async function load(next: Filter, after?: string) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({
        ...(next === 'ALL' ? {} : { status: next }),
        ...(after ? { cursor: after } : {}),
      });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((current) => (after ? [...current, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  const date = (value: Date) =>
    new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));

  const body = (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 && !pending ? (
        <EmptyState
          title={filter === 'ALL' ? t('mine.emptyTitle') : t('mine.emptyFilteredTitle')}
          description={
            filter === 'ALL' ? t('mine.emptyDescription') : t('mine.emptyFilteredDescription')
          }
          action={
            <Link className={buttonClasses({ size: 'lg' })} href="/deneyim/yeni">
              {t('mine.write')}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => {
            const content = item.content as Record<string, unknown>;
            const title =
              typeof content.organizationName === 'string' ? content.organizationName : '';
            const editable = item.status === 'DRAFT' || item.status === 'REJECTED';
            return (
              <li key={item.id} className="rounded-card border border-border bg-bg p-5 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  <Badge tone="info">{t(`types.${item.content.type}`)}</Badge>
                  {item.isAnonymous && <Badge>{t('mine.anonymousNote')}</Badge>}
                </div>
                <h2 className="mt-3 break-words text-lg font-semibold text-fg">
                  {title || t('mine.untitled')}
                </h2>
                <p className="mt-1 text-base text-fg-muted">{t(`statusHint.${item.status}`)}</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {t('mine.updated', { date: date(item.updatedAt) })}
                </p>
                {item.status === 'REJECTED' && item.moderationNote && (
                  <div className="mt-3 rounded-control bg-danger-soft p-3 text-on-danger-soft">
                    <p className="text-sm font-semibold">{t('rejection.title')}</p>
                    <p className="whitespace-pre-line text-base">{item.moderationNote}</p>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {editable && (
                    <Link
                      className={buttonClasses({
                        variant: item.status === 'REJECTED' ? 'primary' : 'secondary',
                      })}
                      href={`/deneyim/${item.id}/duzenle`}
                    >
                      {item.status === 'REJECTED' ? t('rejection.action') : t('mine.edit')}
                    </Link>
                  )}
                  {item.status !== 'DRAFT' && (
                    <Link
                      className={buttonClasses({ variant: 'secondary' })}
                      href={`/deneyim/${item.id}`}
                    >
                      {t('mine.open')}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void load(filter, cursor)}>
          {t('mine.more')}
        </Button>
      )}
    </div>
  );

  const filters: Filter[] = ['ALL', ...EXPERIENCE_STATUSES];
  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-8 pt-10 sm:pt-16">
      <p className="text-base font-semibold text-primary">{t('eyebrow')}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{t('mine.title')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('mine.description')}</p>
      <Tabs
        className="mt-6 [&_[role=tablist]]:flex-wrap [&_[role=tablist]]:overflow-visible"
        label={t('mine.tabs.label')}
        value={filter}
        onValueChange={(id) => {
          setFilter(id as Filter);
          void load(id as Filter);
        }}
        items={filters.map((id) => ({ id, label: t(`mine.tabs.${id}`), content: body }))}
      />
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-6 bg-bg pt-4 pb-2 lg:static">
        <Link className={buttonClasses({ size: 'lg', fullWidth: true })} href="/deneyim/yeni">
          {t('mine.write')}
        </Link>
      </div>
    </div>
  );
}
