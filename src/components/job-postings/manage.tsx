'use client';
import Link from 'next/link';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
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
import { Button, EmptyState, Field, Modal, Textarea, buttonClasses } from '@/components/ui';

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
      const result = await list({ cursor });
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
      const result = await close({ postingId: choice });
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
          <h1 className="text-3xl font-bold">{t('listTitle')}</h1>
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
              className="flex min-w-0 flex-col gap-4 rounded-3xl border border-border bg-surface p-5"
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
                <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-on-primary-soft">
                  {t(`status.${item.status}`)}
                </span>
              </div>
              {item.moderationNote && (
                <p className="break-words rounded-control bg-accent-soft p-3 text-sm text-accent-strong">
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
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<{ id: string; decision: 'PUBLISH' | 'REJECT' }>();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function loadMore() {
    if (!cursor) return;
    start(async () => {
      const result = await list({ cursor });
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
    if (choice.decision === 'REJECT' && reason.trim().length < 10) {
      setError(t('requiredError'));
      return;
    }
    start(async () => {
      const result = await review(
        choice.decision === 'PUBLISH'
          ? { postingId: choice.id, decision: 'PUBLISH' }
          : { postingId: choice.id, decision: 'REJECT', reason: reason.trim() },
      );
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setItems((all) => all.filter((item) => item.id !== choice.id));
      setChoice(undefined);
      router.refresh();
    });
  }
  return (
    <div
      data-hydrated={hydrated ? 'true' : undefined}
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
    >
      <h1 className="mb-7 text-3xl font-bold">{t('moderationTitle')}</h1>
      {items.length ? (
        <ul className="grid gap-4">
          {items.map((item) => (
            <li key={item.id} className="min-w-0 rounded-3xl border border-border bg-surface p-5">
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
                  onClick={() => {
                    setError('');
                    setChoice({ id: item.id, decision: 'PUBLISH' });
                  }}
                >
                  {t('publish')}
                </Button>
                <Button
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
            {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
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
