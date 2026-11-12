'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import type { AdminReportPage, ListAdminReportsInput } from '@/contracts/admin';
import type { JobPostingReportPage } from '@/contracts/job-postings';
import {
  resolveExperienceReportSchema,
  type ResolveExperienceReportInput,
  type ResolveExperienceReportOutput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import { Button, EmptyState, Field, Modal, Textarea, buttonClasses } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { AdminFrame } from './frame';
import { ResponsiveRows } from './responsive-rows';
import { JobPostingReports } from './job-posting-reports';

type Props = {
  initial: AdminReportPage;
  jobReports?: JobPostingReportPage;
  list: (input: ListAdminReportsInput) => Promise<ActionResult<AdminReportPage>>;
  resolve: (
    input: ResolveExperienceReportInput,
  ) => Promise<ActionResult<ResolveExperienceReportOutput>>;
};
export function AdminReports({ initial, jobReports, list, resolve }: Props) {
  const t = useTranslations('admin');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [choice, setChoice] = useState<{ id: string; decision: 'RESOLVED' | 'DISMISSED' }>();
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(false);
  function close() {
    if (pending) return;
    setChoice(undefined);
    setReason('');
    setInvalid(false);
    setError(undefined);
  }
  async function confirm() {
    if (!choice || pending) return;
    const parsed = resolveExperienceReportSchema.safeParse({
      reportId: choice.id,
      decision: choice.decision,
      reason,
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await resolve(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems((current) => current.filter((item) => item.id !== choice.id));
      setChoice(undefined);
      setReason('');
      setNotice(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
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
      setItems((current) => [...current, ...result.data.items]);
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
    }
  }
  return (
    <AdminFrame title={t('report.title')}>
      {notice && (
        <p role="status" className="mb-4 text-on-success-soft">
          {t('success')}
        </p>
      )}
      {error && !choice && (
        <p role="alert" className="mb-4 text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <ResponsiveRows
          headers={[t('name'), t('report.reason'), t('created'), t('actions')]}
          rows={items.map((item) => ({
            id: item.id,
            cells: [
              <div key="target">
                <p>{item.target.organizationName ?? item.target.departmentName}</p>
                <p className="text-fg-muted">
                  {item.target.departmentName} ·{' '}
                  {t('report.count', { count: item.target.openReportCount })}
                </p>
              </div>,
              <p key="reason" className="whitespace-pre-line">
                {item.reason}
              </p>,
              new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(
                new Date(item.createdAt),
              ),
              <div key="actions" className="flex flex-wrap gap-2">
                <Link
                  href={`/deneyim/${item.target.id}`}
                  className={buttonClasses({ variant: 'secondary' })}
                >
                  {t('report.target')}
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => setChoice({ id: item.id, decision: 'RESOLVED' })}
                >
                  {t('report.resolve')}
                </Button>
                <Button
                  variant="secondary"
                  className="border-danger text-danger"
                  onClick={() => setChoice({ id: item.id, decision: 'DISMISSED' })}
                >
                  {t('report.dismiss')}
                </Button>
              </div>,
            ],
          }))}
        />
      )}
      {cursor && (
        <Button className="mt-5" variant="secondary" loading={pending} onClick={() => void more()}>
          {t('more')}
        </Button>
      )}
      {jobReports && <JobPostingReports initial={jobReports} />}
      <Modal
        open={choice !== undefined}
        onClose={close}
        title={t('report.confirmTitle')}
        description={t('report.confirmDescription')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              variant="secondary"
              className="border-danger text-danger"
              loading={pending}
              onClick={() => void confirm()}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          required
          error={invalid ? t('reasonInvalid') : undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="mt-3 text-danger">
            {errors(error)}
          </p>
        )}
      </Modal>
    </AdminFrame>
  );
}
