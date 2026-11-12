'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { resolveJobPostingReportSchema, type JobPostingReportPage } from '@/contracts/job-postings';
import type { ErrorCode } from '@/lib/errors';
import { safeClientAction } from '@/lib/safe-client-action';
import { listJobPostingReports, resolveJobPostingReport } from '@/server/actions/job-postings';
import { Button, EmptyState, Field, Modal, Textarea, buttonClasses } from '@/components/ui';

export function JobPostingReports({ initial }: { initial: JobPostingReportPage }) {
  const t = useTranslations('jobs');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<{ id: string; decision: 'DISMISS' | 'TAKE_DOWN' }>();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);

  function close() {
    if (pending) return;
    setChoice(undefined);
    setReason('');
    setError(undefined);
  }

  async function confirm() {
    if (!choice || pending) return;
    const parsed = resolveJobPostingReportSchema.safeParse({
      reportId: choice.id,
      decision: choice.decision,
      reason,
    });
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await safeClientAction(() => resolveJobPostingReport(parsed.data));
    setPending(false);
    if (!result.ok) {
      setError(result.errorCode);
      return;
    }
    setItems((current) =>
      current.filter(
        (item) =>
          item.id !== choice.id &&
          (choice.decision !== 'TAKE_DOWN' ||
            item.postingId !== items.find((row) => row.id === choice.id)?.postingId),
      ),
    );
    setChoice(undefined);
    setReason('');
    setNotice(true);
  }
  async function more() {
    if (!cursor || pending) return;
    setPending(true);
    const result = await safeClientAction(() => listJobPostingReports({ cursor }));
    setPending(false);
    if (!result.ok) {
      setError(result.errorCode);
      return;
    }
    setItems((current) => [...current, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }
  return (
    <section className="mt-10 space-y-4">
      <h2 className="text-xl font-semibold">{t('reportQueue')}</h2>
      {notice && <p role="status">{t('reportDecisionDone')}</p>}
      {error && !choice && (
        <p role="alert" className="text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t('reportQueueEmpty')} />
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-border bg-surface p-4">
              <h3 className="break-words font-semibold">{item.postingTitle}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words">{item.reason}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  className={buttonClasses({ variant: 'secondary' })}
                  href={`/ilanlar/${item.postingId}`}
                >
                  {t('open')}
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(undefined);
                    setReason('');
                    setChoice({ id: item.id, decision: 'DISMISS' });
                  }}
                >
                  {t('reportDismiss')}
                </Button>
                <Button
                  variant="danger-outline"
                  onClick={() => {
                    setError(undefined);
                    setReason('');
                    setChoice({ id: item.id, decision: 'TAKE_DOWN' });
                  }}
                >
                  {t('reportTakeDown')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void more()}>
          {t('loadMore')}
        </Button>
      )}
      <Modal
        open={!!choice}
        onClose={close}
        title={choice?.decision === 'TAKE_DOWN' ? t('reportTakeDown') : t('reportDismiss')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button loading={pending} onClick={() => void confirm()}>
              {t('confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('reportDecisionReason')} hint={t('reportDecisionHint')} required>
          {(props) => (
            <Textarea
              {...props}
              value={reason}
              maxLength={1000}
              rows={4}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </section>
  );
}
