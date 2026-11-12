'use client';
import Link from 'next/link';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { useQueueFocus } from '@/components/admin/use-queue-focus';
import { reviewJobPostingSchema } from '@/contracts/job-postings';
import type {
  CloseJobPostingOutput,
  JobPostingIdInput,
  MyJobPostingPage,
  ListMyJobPostingsInput,
  ListJobPostingModerationQueueInput,
  JobPostingModerationPage,
  ReviewJobPostingInput,
  ReviewJobPostingOutput,
} from '@/contracts/job-postings';
import type { ActionResult } from '@/contracts/result';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Textarea,
  buttonClasses,
} from '@/components/ui';

export function MyPostings({
  initial,
  close,
  list,
}: {
  initial: MyJobPostingPage;
  list: (input: ListMyJobPostingsInput) => Promise<ActionResult<MyJobPostingPage>>;
  close: (input: JobPostingIdInput) => Promise<ActionResult<CloseJobPostingOutput>>;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('jobs');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<string>();
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function loadMore() {
    if (!cursor) return;
    start(async () => {
      const result = await list({ cursor }).catch(
        () => ({ ok: false, errorCode: 'SERVER_UNEXPECTED' }) as const,
      );
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setItems((items) => [...items, ...result.data.items]);
      setCursor(result.data.nextCursor);
    });
  }
  function confirm() {
    if (!choice) return;
    start(async () => {
      const result = await close({ postingId: choice }).catch(
        () => ({ ok: false, errorCode: 'SERVER_UNEXPECTED' }) as const,
      );
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setItems((all) =>
        all.map((item) => (item.id === choice ? { ...item, status: 'CLOSED' } : item)),
      );
      setChoice(undefined);
      router.refresh();
    });
  }
  return (
    <div
      data-hydrated={hydrated ? 'true' : undefined}
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
    >
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/ilanlar"
            className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
          >
            ← {t('back')}
          </Link>
          <PageHeader title={t('listTitle')} />
        </div>
        <Link href="/ilanlar/yeni" className={buttonClasses()}>
          {t('post')}
        </Link>
      </div>
      {items.length ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-fg-muted">
                    {item.organizationName ?? '—'}
                  </p>
                  <h2 className="mt-1 break-words text-xl font-bold">
                    {item.title ?? t('draftEmpty')}
                  </h2>
                </div>
                <Badge
                  tone={
                    item.status === 'PUBLISHED'
                      ? 'success'
                      : item.status === 'REJECTED'
                        ? 'danger'
                        : item.status === 'PENDING'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {t(`status.${item.status}`)}
                </Badge>
              </div>
              {item.publishedAt && item.matchReach && (
                <p className="text-sm text-fg-muted">
                  {item.matchReach.belowThreshold
                    ? t('reachFew')
                    : t('reachCount', { count: item.matchReach.count })}
                </p>
              )}
              {item.moderationNote && (
                <p className="break-words rounded-control bg-accent-soft p-3 text-sm text-on-accent-soft">
                  {t('moderationReason', { reason: item.moderationNote })}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-3">
                {(item.status === 'DRAFT' || item.status === 'REJECTED') && (
                  <Link
                    href={`/ilanlar/${encodeURIComponent(item.id)}/duzenle`}
                    className={buttonClasses({ variant: 'secondary' })}
                  >
                    {t('edit')}
                  </Link>
                )}
                {(item.status === 'PENDING' || item.status === 'PUBLISHED') && (
                  <Button
                    variant="danger-outline"
                    onClick={() => {
                      setError('');
                      setChoice(item.id);
                    }}
                  >
                    {t('close')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t('listEmpty')}
          action={
            <Link href="/ilanlar/yeni" className={buttonClasses()}>
              {t('post')}
            </Link>
          }
        />
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
      {error && !choice && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Modal
        open={!!choice}
        onClose={() => setChoice(undefined)}
        title={t('close')}
        description={t('closeConfirm')}
        footer={
          <>
            <Button variant="danger" loading={pending} onClick={confirm}>
              {t('close')}
            </Button>
            <Button variant="secondary" onClick={() => setChoice(undefined)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
export function PostingModeration({
  initial,
  review,
  list,
}: {
  initial: JobPostingModerationPage;
  list: (
    input: ListJobPostingModerationQueueInput,
  ) => Promise<ActionResult<JobPostingModerationPage>>;
  review: (input: ReviewJobPostingInput) => Promise<ActionResult<ReviewJobPostingOutput>>;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('jobs');
  const errors = useTranslations('errors.codes');
  const admin = useTranslations('admin');
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<{ id: string; decision: 'PUBLISH' | 'REJECT' }>();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const { rootRef, complete } = useQueueFocus(pending);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  function loadMore() {
    if (!cursor) return;
    start(async () => {
      const result = await list({ cursor }).catch(
        () => ({ ok: false, errorCode: 'SERVER_UNEXPECTED' }) as const,
      );
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setItems((items) => [...items, ...result.data.items]);
      setCursor(result.data.nextCursor);
    });
  }
  function confirm() {
    if (!choice) return;
    const parsed = reviewJobPostingSchema.safeParse(
      choice.decision === 'PUBLISH'
        ? { postingId: choice.id, decision: 'PUBLISH' }
        : { postingId: choice.id, decision: 'REJECT', reason },
    );
    if (!parsed.success) {
      setError(reason.trim().length < 3 ? admin('reasonInvalid') : t('requiredError'));
      reasonRef.current?.focus();
      return;
    }
    start(async () => {
      const result = await review(parsed.data).catch(
        () => ({ ok: false, errorCode: 'SERVER_UNEXPECTED' }) as const,
      );
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      complete(choice.id);
      setItems((all) => all.filter((item) => item.id !== choice.id));
      setChoice(undefined);
      router.refresh();
    });
  }
  return (
    <div
      ref={rootRef}
      data-hydrated={hydrated ? 'true' : undefined}
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
    >
      <PageHeader title={t('moderationTitle')} className="mb-7" />
      {items.length ? (
        <ul className="grid gap-4">
          {items.map((item) => (
            <li
              key={item.id}
              data-queue-row={item.id}
              className="min-w-0 rounded-card border border-border bg-surface p-5"
            >
              <p className="break-words text-sm text-fg-muted">
                {item.organizationName} · {t('reviewedBy', { name: item.author.displayName })}
              </p>
              <h2 className="mt-2 break-words text-xl font-bold">{item.title}</h2>
              <p className="mt-3 whitespace-pre-wrap break-words">{item.description}</p>
              <p className="mt-3 text-sm text-fg-muted">
                {item.targetDepartments.map((d) => d.name).join(', ')} · {item.deadlineOn}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  data-queue-action
                  onClick={() => {
                    setError('');
                    setChoice({ id: item.id, decision: 'PUBLISH' });
                  }}
                >
                  {t('publish')}
                </Button>
                <Button
                  data-queue-action
                  variant="danger-outline"
                  onClick={() => {
                    setReason('');
                    setError('');
                    setChoice({ id: item.id, decision: 'REJECT' });
                  }}
                >
                  {t('reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('moderationEmpty')} />
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
      {error && !choice && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Modal
        open={!!choice}
        onClose={() => setChoice(undefined)}
        title={t(choice?.decision === 'REJECT' ? 'reject' : 'publish')}
        description={
          choice ? t(choice.decision === 'REJECT' ? 'rejectText' : 'publishText') : undefined
        }
        footer={
          <>
            <Button
              variant={choice?.decision === 'REJECT' ? 'danger' : 'primary'}
              loading={pending}
              onClick={confirm}
            >
              {t('confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setChoice(undefined)}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        {choice?.decision === 'REJECT' && (
          <Field label={t('reason')} required error={error}>
            {(p) => (
              <Textarea
                {...p}
                ref={reasonRef}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
        )}
        {error && choice?.decision !== 'REJECT' && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </Modal>
    </div>
  );
}
