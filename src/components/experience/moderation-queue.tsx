'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';

import {
  resolveExperienceReportSchema,
  reviewExperienceSchema,
  type ExperiencePage,
  type ExperienceReportPage,
  type ListExperienceReportsInput,
  type ListModerationQueueInput,
  type ResolveExperienceReportInput,
  type ResolveExperienceReportOutput,
  type ReviewExperienceInput,
  type ReviewExperienceOutput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import {
  Badge,
  Button,
  buttonClasses,
  EmptyState,
  Field,
  Modal,
  Tabs,
  Textarea,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { ExperienceContent } from './experience-content';

type Props = {
  initialExperiences: ExperiencePage;
  initialReports: ExperienceReportPage;
  listExperiences: (input: ListModerationQueueInput) => Promise<ActionResult<ExperiencePage>>;
  review: (input: ReviewExperienceInput) => Promise<ActionResult<ReviewExperienceOutput>>;
  listReports: (input: ListExperienceReportsInput) => Promise<ActionResult<ExperienceReportPage>>;
  resolve: (
    input: ResolveExperienceReportInput,
  ) => Promise<ActionResult<ResolveExperienceReportOutput>>;
};

const dateOf = (value: Date) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));

type Choice = { id: string; kind: 'PUBLISH' | 'REJECT' | 'RESOLVED' | 'DISMISSED' };

/** Karar penceresi (yayınla / ret gerekçesi / şikâyet kararı): gerekçe alan hatası pencerenin içinde. */
function DecisionModal({
  choice,
  pending,
  error,
  reasonInvalid,
  reason,
  setReason,
  onConfirm,
  onClose,
}: {
  choice?: Choice;
  pending: boolean;
  error?: ErrorCode;
  reasonInvalid?: ErrorCode;
  reason: string;
  setReason: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('experiences.queue');
  const errors = useTranslations('errors.codes');
  const needsReason = choice !== undefined && choice.kind !== 'PUBLISH';
  const copy =
    choice?.kind === 'PUBLISH'
      ? { title: t('publishTitle'), description: t('publishDescription'), action: t('publish') }
      : choice?.kind === 'REJECT'
        ? { title: t('rejectTitle'), description: t('rejectDescription'), action: t('reject') }
        : {
            title: t('resolveTitle'),
            description: t('resolveDescription'),
            action: choice?.kind === 'DISMISSED' ? t('dismiss') : t('resolve'),
          };
  return (
    <Modal
      open={choice !== undefined}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button
            variant={choice?.kind === 'REJECT' ? 'danger' : 'primary'}
            fullWidth
            loading={pending}
            onClick={onConfirm}
          >
            {copy.action}
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('cancel')}
          </Button>
        </>
      }
    >
      {needsReason && (
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          required
          error={reasonInvalid ? errors(reasonInvalid) : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
      )}
      {error && (
        <p role="alert" className="mt-3 text-base text-danger">
          {errors(error)}
        </p>
      )}
    </Modal>
  );
}

function useDecision<Out>(
  run: (choice: Choice, reason: string) => Promise<ActionResult<Out>> | ErrorCode,
  onDone: (choice: Choice) => void,
) {
  const [choice, setChoice] = useState<Choice>();
  const [reason, setReason] = useState('');
  const [reasonInvalid, setReasonInvalid] = useState<ErrorCode>();
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  function close() {
    if (pending) return;
    setChoice(undefined);
    setReason('');
    setReasonInvalid(undefined);
    setError(undefined);
  }
  async function confirm() {
    if (!choice || locked.current) return;
    const early = run(choice, reason);
    if (typeof early === 'string') {
      setReasonInvalid(early);
      return;
    }
    locked.current = true;
    setPending(true);
    setReasonInvalid(undefined);
    setError(undefined);
    try {
      const result = await early;
      if (result.ok) {
        onDone(choice);
        setChoice(undefined);
        setReason('');
      } else if (result.fieldErrors?.reason) setReasonInvalid(result.fieldErrors.reason);
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { choice, setChoice, reason, setReason, reasonInvalid, error, pending, close, confirm };
}

export function ModerationQueue({
  initialExperiences,
  initialReports,
  listExperiences,
  review,
  listReports,
  resolve,
}: Props) {
  const t = useTranslations('experiences');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initialExperiences.items);
  const [cursor, setCursor] = useState(initialExperiences.nextCursor);
  const [reports, setReports] = useState(initialReports.items);
  const [reportCursor, setReportCursor] = useState(initialReports.nextCursor);
  const [notice, setNotice] = useState<string>();
  const [listError, setListError] = useState<ErrorCode>();
  const [loading, setLoading] = useState(false);
  const locked = useRef(false);

  const experienceDecision = useDecision<ReviewExperienceOutput>(
    (choice, reason) => {
      const input =
        choice.kind === 'REJECT'
          ? { experienceId: choice.id, decision: 'REJECT' as const, reason }
          : { experienceId: choice.id, decision: 'PUBLISH' as const };
      const parsed = reviewExperienceSchema.safeParse(input);
      if (!parsed.success) {
        return parsed.error.issues.some((issue) => issue.message === 'AUDIT_REASON_REQUIRED')
          ? 'AUDIT_REASON_REQUIRED'
          : 'AUDIT_REASON_INVALID';
      }
      return review(parsed.data);
    },
    (choice) => {
      setItems((current) => current.filter((item) => item.id !== choice.id));
      setNotice(choice.kind === 'PUBLISH' ? t('queue.published') : t('queue.rejected'));
    },
  );
  const reportDecision = useDecision<ResolveExperienceReportOutput>(
    (choice, reason) => {
      const parsed = resolveExperienceReportSchema.safeParse({
        reportId: choice.id,
        decision: choice.kind === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED',
        reason,
      });
      if (!parsed.success)
        return reason.trim() === '' ? 'AUDIT_REASON_REQUIRED' : 'AUDIT_REASON_INVALID';
      return resolve(parsed.data);
    },
    (choice) => {
      setReports((current) => current.filter((item) => item.id !== choice.id));
      setNotice(t('queue.resolved'));
    },
  );

  async function more(kind: 'experiences' | 'reports') {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setListError(undefined);
    try {
      if (kind === 'experiences' && cursor) {
        const result = await listExperiences({ cursor });
        if (result.ok) {
          setItems((current) => [...current, ...result.data.items]);
          setCursor(result.data.nextCursor);
        } else setListError(result.errorCode);
      }
      if (kind === 'reports' && reportCursor) {
        const result = await listReports({ cursor: reportCursor });
        if (result.ok) {
          setReports((current) => [...current, ...result.data.items]);
          setReportCursor(result.data.nextCursor);
        } else setListError(result.errorCode);
      }
    } catch {
      setListError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setLoading(false);
    }
  }

  const experiencesPanel =
    items.length === 0 && !cursor ? (
      <EmptyState
        title={t('queue.emptyTitle')}
        description={t('queue.emptyDescription')}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {t('queue.refresh')}
          </Button>
        }
      />
    ) : (
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.id} className="rounded-card border border-border bg-bg p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="category">{t(`types.${item.content.type}`)}</Badge>
              {item.isAnonymous && <Badge>{t('mine.anonymousNote')}</Badge>}
            </div>
            <h2 className="mt-3 break-words text-lg font-semibold text-fg">
              {(item.content as { organizationName?: string }).organizationName ??
                t('mine.untitled')}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {t('queue.submitted', { date: dateOf(item.updatedAt) })}
            </p>
            {item.isAnonymous && (
              <p className="mt-1 text-sm text-fg-muted">{t('queue.authorHidden')}</p>
            )}
            <details className="mt-4 rounded-control border border-border p-3">
              <summary className="min-h-11 cursor-pointer text-base font-medium text-primary">
                {t('queue.view')}
              </summary>
              <div className="mt-3">
                <ExperienceContent content={item.content} />
              </div>
            </details>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                onClick={() => experienceDecision.setChoice({ id: item.id, kind: 'PUBLISH' })}
              >
                {t('queue.publish')}
              </Button>
              <Button
                variant="danger"
                onClick={() => experienceDecision.setChoice({ id: item.id, kind: 'REJECT' })}
              >
                {t('queue.reject')}
              </Button>
            </div>
          </li>
        ))}
        {cursor && (
          <Button variant="secondary" loading={loading} onClick={() => void more('experiences')}>
            {t('queue.more')}
          </Button>
        )}
      </ul>
    );

  const reportsPanel =
    reports.length === 0 && !reportCursor ? (
      <EmptyState
        title={t('queue.emptyReportsTitle')}
        description={t('queue.emptyReportsDescription')}
      />
    ) : (
      <ul className="flex flex-col gap-4">
        {reports.map((report) => (
          <li key={report.id} className="rounded-card border border-border bg-bg p-5 shadow-card">
            <p className="text-sm text-fg-muted">
              {t('queue.reportDate', { date: dateOf(report.createdAt) })}
            </p>
            <p className="mt-2 text-sm font-semibold text-fg">{t('queue.reportReason')}</p>
            <p className="whitespace-pre-line break-words text-base text-fg">{report.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className={buttonClasses({ variant: 'secondary' })}
                href={`/deneyim/${report.targetId}`}
              >
                {t('queue.reportedOn')}
              </Link>
              <Button onClick={() => reportDecision.setChoice({ id: report.id, kind: 'RESOLVED' })}>
                {t('queue.resolve')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => reportDecision.setChoice({ id: report.id, kind: 'DISMISSED' })}
              >
                {t('queue.dismiss')}
              </Button>
            </div>
          </li>
        ))}
        {reportCursor && (
          <Button variant="secondary" loading={loading} onClick={() => void more('reports')}>
            {t('queue.more')}
          </Button>
        )}
      </ul>
    );

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="mb-6">
        <p className="mb-2 text-base font-semibold text-primary">{t('queue.eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{t('queue.title')}</h1>
        <p className="mt-3 text-base text-fg-muted">{t('queue.description')}</p>
      </header>
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-control bg-success-soft p-4 text-base text-on-success-soft"
        >
          {notice}
        </p>
      )}
      {listError && (
        <p role="alert" className="mb-4 text-base text-danger">
          {errors(listError)}
        </p>
      )}
      <Tabs
        label={t('queue.tabs.label')}
        items={[
          { id: 'experiences', label: t('queue.tabs.experiences'), content: experiencesPanel },
          { id: 'reports', label: t('queue.tabs.reports'), content: reportsPanel },
        ]}
      />
      <DecisionModal
        choice={experienceDecision.choice}
        pending={experienceDecision.pending}
        error={experienceDecision.error}
        reasonInvalid={experienceDecision.reasonInvalid}
        reason={experienceDecision.reason}
        setReason={experienceDecision.setReason}
        onConfirm={() => void experienceDecision.confirm()}
        onClose={experienceDecision.close}
      />
      <DecisionModal
        choice={reportDecision.choice}
        pending={reportDecision.pending}
        error={reportDecision.error}
        reasonInvalid={reportDecision.reasonInvalid}
        reason={reportDecision.reason}
        setReason={reportDecision.setReason}
        onConfirm={() => void reportDecision.confirm()}
        onClose={reportDecision.close}
      />
    </div>
  );
}
