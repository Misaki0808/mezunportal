'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  CV_MAX_BYTES,
  type ApplyCvInput,
  type ApplyCvOutput,
  type CvAvailability,
  type CvIdInput,
  type CvReview as CvReviewData,
  type CvStatusOutput,
  type CvUploadOutput,
  type DiscardCvOutput,
} from '@/contracts/cv';
import type { ActionResult } from '@/contracts/result';
import { Button, buttonClasses, Field, Sheet } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { CvReview } from './cv-review';

export type CvActions = {
  upload: (formData: FormData) => Promise<ActionResult<CvUploadOutput>>;
  getStatus: (input: CvIdInput) => Promise<ActionResult<CvStatusOutput>>;
  getReview: (input: CvIdInput) => Promise<ActionResult<CvReviewData>>;
  apply: (input: ApplyCvInput) => Promise<ActionResult<ApplyCvOutput>>;
  discard: (input: CvIdInput) => Promise<ActionResult<DiscardCvOutput>>;
};

type Props = {
  availability: CvAvailability;
  latest: CvStatusOutput | null;
  /** Sunucuda önceden yüklenmiş onay verisi (`PARSED` ise). */
  initialReview?: CvReviewData;
  actions: CvActions;
  /** Test için kısaltılabilir. */
  pollMs?: number;
};

type View =
  | { kind: 'idle'; applied: boolean }
  | { kind: 'processing'; id: string; status: 'QUEUED' | 'PARSING' }
  | { kind: 'failed'; errorCode: string | null }
  | { kind: 'review'; review: CvReviewData }
  | { kind: 'done'; output: ApplyCvOutput };

function viewOf(latest: CvStatusOutput | null, review?: CvReviewData): View {
  if (!latest) return { kind: 'idle', applied: false };
  if (latest.status === 'QUEUED' || latest.status === 'PARSING') {
    return { kind: 'processing', id: latest.cvUploadId, status: latest.status };
  }
  if (latest.status === 'FAILED') return { kind: 'failed', errorCode: latest.errorCode };
  if (latest.status === 'PARSED' && review) return { kind: 'review', review };
  return { kind: 'idle', applied: latest.status === 'APPLIED' };
}

const FAILURE_KEYS = [
  'CV_PARSE_UNAVAILABLE',
  'CV_PARSE_TIMEOUT',
  'CV_PARSE_INVALID_OUTPUT',
  'CV_PARSE_EMPTY',
  'CV_PROVIDER_NOT_CONFIGURED',
  'CV_TRANSFER_CONSENT_REQUIRED',
] as const;

/** CV yükle → işleniyor → onay. Elle düzenleme her zaman açıktır; hata ve kapalı durumlar oraya yönlendirir. */
export function CvFlow({ availability, latest, initialReview, actions, pollMs = 3000 }: Props) {
  const t = useTranslations('profile.cv');
  const errors = useTranslations('errors.codes');
  const [view, setView] = useState<View>(() => viewOf(latest, initialReview));
  const [fileError, setFileError] = useState<ErrorCode>();
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const [guide, setGuide] = useState(false);
  const [source, setSource] = useState<'CV' | 'LINKEDIN_PDF'>('CV');
  const locked = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const kind = view.kind;

  // İşleniyor görünümü: ilerlemeyi aralıkla sorar; bitince onay ekranına ya da hata görünümüne geçer.
  const processingId = view.kind === 'processing' ? view.id : undefined;
  useEffect(() => {
    if (!processingId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped) return;
      const status = await actions.getStatus({ cvUploadId: processingId }).catch(() => null);
      if (stopped || !status?.ok) return;
      const next = status.data.status;
      if (next === 'PARSED') {
        const review = await actions.getReview({ cvUploadId: processingId }).catch(() => null);
        if (stopped) return;
        if (review?.ok) setView({ kind: 'review', review: review.data });
        else if (review) setError(review.errorCode);
      } else if (next === 'FAILED') {
        setView({ kind: 'failed', errorCode: status.data.errorCode });
      } else if (next === 'QUEUED' || next === 'PARSING') {
        setView((current) =>
          current.kind === 'processing' && current.status !== next
            ? { ...current, status: next }
            : current,
        );
      } else {
        setView({ kind: 'idle', applied: next === 'APPLIED' });
      }
    }, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [processingId, actions, pollMs]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [kind]);

  async function upload(form: HTMLFormElement) {
    if (locked.current) return;
    const data = new FormData(form);
    const input = form.elements.namedItem('file') as HTMLInputElement | null;
    const file = input?.files?.[0];
    setError(undefined);
    setFileError(undefined);
    if (!file) {
      setFileError('DOCUMENT_REQUIRED');
      return;
    }
    if (file.size === 0) {
      setFileError('DOCUMENT_EMPTY');
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setFileError('DOCUMENT_TOO_LARGE');
      return;
    }
    if (file.type !== 'application/pdf') {
      setFileError('DOCUMENT_NOT_PDF');
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const result = await actions.upload(data);
      if (result.ok) setView({ kind: 'processing', id: result.data.cvUploadId, status: 'QUEUED' });
      else if (result.fieldErrors?.file) setFileError(result.fieldErrors.file);
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  const title =
    view.kind === 'processing'
      ? t('processing.title')
      : view.kind === 'failed'
        ? t('failed.title')
        : view.kind === 'done'
          ? t('done.title')
          : t('title');

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-5 pb-8 pt-10 sm:pt-16">
      <p className="text-base font-semibold text-primary">{t('eyebrowLabel')}</p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-2 text-3xl font-semibold tracking-tight text-fg focus:outline-none"
      >
        {title}
      </h1>

      {view.kind === 'idle' && (
        <>
          <p className="mt-3 text-base leading-relaxed text-fg-muted">{t('description')}</p>
          {view.applied && (
            <p
              role="status"
              className="mt-4 rounded-control bg-success-soft p-3 text-base text-on-success-soft"
            >
              {t('applied')}
            </p>
          )}
          {!availability.available && availability.reason ? (
            <div className="mt-6 rounded-card border border-border bg-surface p-4">
              <p role="status" className="text-base text-fg">
                {t(`unavailable.${availability.reason}`)}
              </p>
              {availability.reason === 'TRANSFER_CONSENT_REQUIRED' && (
                <Link className={buttonClasses({ variant: 'secondary' }) + ' mt-3'} href="/onay">
                  {t('consentAction')}
                </Link>
              )}
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void upload(event.currentTarget);
              }}
              className="mt-6 flex flex-col gap-4"
            >
              <fieldset className="space-y-2">
                <legend className="font-semibold">{t('linkedin.chooseSource')}</legend>
                <label className="flex min-h-11 items-center gap-3 rounded-control border border-border p-3">
                  <input
                    type="radio"
                    name="source"
                    value="CV"
                    checked={source === 'CV'}
                    onChange={() => setSource('CV')}
                  />
                  {t('linkedin.normalCv')}
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-control border border-border p-3">
                  <input
                    type="radio"
                    name="source"
                    value="LINKEDIN_PDF"
                    checked={source === 'LINKEDIN_PDF'}
                    onChange={() => setSource('LINKEDIN_PDF')}
                  />
                  {t('linkedin.importAction')}
                </label>
              </fieldset>
              <Field
                label={t('file')}
                hint={t('fileHint')}
                error={fileError ? errors(fileError) : undefined}
                required
              >
                {({ invalid, ...control }) => (
                  <input
                    {...control}
                    type="file"
                    name="file"
                    accept="application/pdf"
                    aria-invalid={invalid || undefined}
                    className="block min-h-11 w-full rounded-control border border-border-control bg-bg p-2 text-base text-fg file:mr-3 file:min-h-9 file:rounded-control file:border-0 file:bg-primary-soft file:px-3 file:text-on-primary-soft"
                  />
                )}
              </Field>
              <p className="text-sm text-fg-muted">
                {t('remaining', { count: availability.remainingToday })}
              </p>
              <Button variant="ghost" onClick={() => setGuide(true)}>
                {t('linkedin.open')}
              </Button>
              {error && (
                <p role="alert" className="text-base text-danger">
                  {errors(error)}
                </p>
              )}
              <div className="sticky-actions z-20 bg-bg pt-2 pb-2">
                <Button type="submit" size="lg" fullWidth loading={pending}>
                  {pending ? t('uploading') : t('submit')}
                </Button>
              </div>
            </form>
          )}
          <Link
            className={buttonClasses({ variant: 'ghost', fullWidth: true }) + ' mt-2'}
            href="/profil"
          >
            {t('manualLink')}
          </Link>
        </>
      )}

      {view.kind === 'processing' && (
        <div role="status" className="mt-4 flex flex-col gap-3">
          <p className="text-base leading-relaxed text-fg-muted">{t('processing.description')}</p>
          <p className="text-base font-semibold text-fg">
            {view.status === 'QUEUED' ? t('processing.queued') : t('processing.parsing')}
          </p>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-strong">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          {error && (
            <p role="alert" className="text-base text-danger">
              {errors(error)}
            </p>
          )}
        </div>
      )}

      {view.kind === 'failed' && (
        <div className="mt-4 flex flex-col gap-3">
          <p role="alert" className="text-base text-fg">
            {(FAILURE_KEYS as readonly string[]).includes(view.errorCode ?? '')
              ? errors(view.errorCode as (typeof FAILURE_KEYS)[number])
              : errors('CV_PARSE_UNAVAILABLE')}
          </p>
          <Link className={buttonClasses({ size: 'lg', fullWidth: true })} href="/profil">
            {t('failed.manual')}
          </Link>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setView({ kind: 'idle', applied: false })}
          >
            {t('failed.retry')}
          </Button>
        </div>
      )}

      {view.kind === 'review' && (
        <div className="mt-4">
          <CvReview
            review={view.review}
            apply={actions.apply}
            discard={actions.discard}
            onApplied={(output) => setView({ kind: 'done', output })}
            onDiscarded={() => setView({ kind: 'idle', applied: false })}
          />
        </div>
      )}

      {view.kind === 'done' && (
        <div className="mt-4 flex flex-col gap-3">
          <p role="status" className="text-base text-fg">
            {t('done.summary', { created: view.output.created, updated: view.output.updated })}
          </p>
          {view.output.invitations > 0 && (
            <p className="text-base text-fg">
              {t('done.invitations', { count: view.output.invitations })}
            </p>
          )}
          {view.output.invitations > 0 && (
            <Link
              className={buttonClasses({ variant: 'secondary', fullWidth: true })}
              href="/deneyim/yeni"
            >
              {t('done.invitationsAction')}
            </Link>
          )}
          <Link className={buttonClasses({ size: 'lg', fullWidth: true })} href="/profil">
            {t('done.profile')}
          </Link>
        </div>
      )}

      <Sheet
        open={guide}
        onClose={() => setGuide(false)}
        title={t('linkedin.title')}
        footer={
          <Button fullWidth onClick={() => setGuide(false)}>
            {t('linkedin.close')}
          </Button>
        }
      >
        <ol className="list-decimal space-y-2 pl-5 text-base text-fg">
          <li>{t('linkedin.step1')}</li>
          <li>{t('linkedin.step2')}</li>
          <li>{t('linkedin.step3')}</li>
        </ol>
        <p className="mt-3 text-sm text-fg-muted">{t('linkedin.note')}</p>
      </Sheet>
    </div>
  );
}
