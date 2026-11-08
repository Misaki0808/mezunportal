'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  graduationDocumentFileHref,
  reviewGraduationDocumentSchema,
  type ListPendingGraduationDocumentsInput,
  type PendingGraduationDocumentPage,
  type ReviewGraduationDocumentInput,
  type ReviewGraduationDocumentOutput,
} from '@/contracts/graduation-document';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Modal, PageHeader, Textarea } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  initial: PendingGraduationDocumentPage;
  list: (
    input?: ListPendingGraduationDocumentsInput,
  ) => Promise<ActionResult<PendingGraduationDocumentPage>>;
  review: (
    input: ReviewGraduationDocumentInput,
  ) => Promise<ActionResult<ReviewGraduationDocumentOutput>>;
};

export function ReviewQueue({ initial, list, review }: Props) {
  const t = useTranslations('authScreens.queue');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [selection, setSelection] = useState<{ id: string; decision: 'APPROVE' | 'REJECT' }>();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<ErrorCode>();
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const reasonInput = useRef<HTMLTextAreaElement>(null);

  async function loadMore() {
    if (!cursor || locked.current) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({ cursor });
      if (result.ok) {
        setItems((current) => [...current, ...result.data.items]);
        setCursor(result.data.nextCursor);
      } else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  function close() {
    if (pending) return;
    setSelection(undefined);
    setReason('');
    setReasonError(undefined);
    setError(undefined);
  }

  async function decide() {
    if (!selection || locked.current) return;
    setReasonError(undefined);
    setError(undefined);
    const input =
      selection.decision === 'REJECT'
        ? { documentId: selection.id, decision: 'REJECT' as const, reason }
        : { documentId: selection.id, decision: 'APPROVE' as const };
    const parsed = reviewGraduationDocumentSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((item) => item.path[0] === 'reason');
      setReasonError(
        issue?.message === 'AUDIT_REASON_REQUIRED'
          ? 'AUDIT_REASON_REQUIRED'
          : 'AUDIT_REASON_INVALID',
      );
      reasonInput.current?.focus();
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const result = await review(parsed.data);
      if (result.ok) {
        setItems((current) => current.filter((item) => item.id !== selection.id));
        setSelection(undefined);
        setReason('');
        setNotice(true);
      } else if (result.fieldErrors?.reason) {
        setReasonError(result.fieldErrors.reason);
        reasonInput.current?.focus();
      } else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <PageHeader
        className="mb-8"
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-control bg-success-soft p-4 text-base text-on-success-soft"
        >
          {t('success')}
        </p>
      )}
      {!selection && error && (
        <p role="alert" className="mb-4 text-base text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 && !cursor ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t('refresh')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-border bg-bg p-5 shadow-card">
              <div className="flex flex-col gap-1">
                <h2 className="break-words text-lg font-semibold text-fg">{item.applicantName}</h2>
                <p className="break-all text-base text-fg-muted">{item.maskedEmail}</p>
                <p className="text-base text-fg">{item.departmentName}</p>
                <p className="text-base text-fg-muted">
                  {t('year', { year: item.graduationYear })}
                </p>
                <time
                  className="text-base text-fg-muted"
                  dateTime={new Date(item.submittedAt).toISOString()}
                >
                  {new Intl.DateTimeFormat('tr-TR', {
                    timeZone: 'Europe/Istanbul',
                    dateStyle: 'medium',
                  }).format(new Date(item.submittedAt))}
                </time>
              </div>
              <div className="mt-5 flex flex-col gap-3">
                <a
                  href={graduationDocumentFileHref(item.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press-control inline-flex min-h-11 items-center text-base font-medium text-primary underline underline-offset-4"
                >
                  {t('view')}
                </a>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => {
                      setNotice(false);
                      setSelection({ id: item.id, decision: 'APPROVE' });
                    }}
                  >
                    {t('approve')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNotice(false);
                      setSelection({ id: item.id, decision: 'REJECT' });
                    }}
                  >
                    {t('reject')}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <div className="mt-6">
          <Button variant="secondary" fullWidth loading={pending} onClick={loadMore}>
            {t('next')}
          </Button>
        </div>
      )}
      <Modal
        open={Boolean(selection)}
        onClose={close}
        title={t(selection?.decision === 'REJECT' ? 'rejectTitle' : 'approveTitle')}
        description={t(
          selection?.decision === 'REJECT' ? 'rejectDescription' : 'approveDescription',
        )}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant={selection?.decision === 'REJECT' ? 'danger' : 'primary'}
              loading={pending}
              onClick={decide}
            >
              {pending
                ? t('saving')
                : t(selection?.decision === 'REJECT' ? 'confirmReject' : 'confirmApprove')}
            </Button>
          </>
        }
      >
        {selection?.decision === 'APPROVE' && (
          <p className="text-base">
            {t('applicant', {
              name: items.find((item) => item.id === selection.id)?.applicantName ?? '',
            })}
          </p>
        )}
        {selection?.decision === 'REJECT' && (
          <Field
            className="[&_p]:text-base"
            label={t('reason')}
            required
            error={reasonError ? errors(reasonError) : undefined}
          >
            {(control) => (
              <Textarea
                {...control}
                ref={reasonInput}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
        )}
        {selection && error && (
          <p role="alert" className="mt-4 text-base text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </div>
  );
}
