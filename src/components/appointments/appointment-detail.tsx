'use client';
import { useHydrated } from '@/hooks/use-hydrated';
import { Avatar } from '@/components/ui';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  appointmentIcsHref,
  cancelAppointmentSchema,
  respondAppointmentSchema,
  setMeetLinkSchema,
  type AppointmentView,
  type CancelAppointmentInput,
  type RespondAppointmentInput,
  type SetMeetLinkInput,
} from '@/contracts/appointment';
import type { ActionResult } from '@/contracts/result';
import {
  Button,
  ChevronLeftIcon,
  Field,
  Input,
  Modal,
  PageHeader,
  Textarea,
  buttonClasses,
  cn,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import { userTextLength } from '@/lib/user-text';

import { AppointmentTimeline } from './appointment-timeline';
import { AppointmentStatusBadge } from './status-badge';
import { fullLabel, rangeLabel } from './time';

type Result = Promise<ActionResult<unknown>>;
export type AppointmentActions = {
  respond: (input: RespondAppointmentInput) => Result;
  cancel: (input: CancelAppointmentInput) => Result;
  setMeetLink: (input: SetMeetLinkInput) => Result;
};

/**
 * Randevu detayı: zaman/biçim/yer/not, Meet bağlantısı (yoksa mentor elle ekler), onay/ret/iptal ve `.ics`.
 * Düğmeler sunucunun `actions` bayraklarından gelir; sunucu her eylemde yeniden denetler. Kapasite doluysa onay devre dışıdır
 * ve SEBEBİ yazar. Eylemden sonra sunucu verisi yenilenir (`router.refresh`).
 */
export function AppointmentDetail({
  appointment,
  actions,
  feedbackAvailable = false,
}: {
  appointment: AppointmentView;
  actions: AppointmentActions;
  feedbackAvailable?: boolean;
}) {
  const t = useTranslations('appointments.detail');
  const formText = useTranslations('formText');
  const modes = useTranslations('appointments.modes');
  const feedback = useTranslations('feedback');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const hydrated = useHydrated();
  const [dialog, setDialog] = useState<'decline' | 'cancel'>();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<ErrorCode>();
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);
  const [pending, setPending] = useState<string>();
  const locked = useRef(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // İptal/onay/ret düğmesi eylemden sonra kalkar; odak kaybolmasın, sonuç (ya da hata) metnine taşınır.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const a = appointment;

  async function run(name: string, action: () => Result, onFail?: (code: ErrorCode) => void) {
    if (locked.current) return;
    locked.current = true;
    setPending(name);
    setError(undefined);
    setNotice(false);
    try {
      const result = await action();
      if (result.ok) {
        setDialog(undefined);
        setReason('');
        setNotice(true);
        router.refresh();
      } else if (onFail) onFail(result.errorCode);
      else {
        setError(result.errorCode);
        setDialog(undefined);
      }
    } catch {
      setError('SERVER_UNEXPECTED');
      setDialog(undefined);
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  // Pencere açılırken önceki "İşlem kaydedildi."/hata iletisi bayat kalmaz (pencerenin arkasında başarı yazısı durmasın).
  function openDialog(kind: 'decline' | 'cancel') {
    setNotice(false);
    setError(undefined);
    setReasonError('');
    setDialog(kind);
  }

  function submitDialog() {
    const optionalReason = reason.trim() ? { reason } : {};
    if (dialog === 'decline') {
      const parsed = respondAppointmentSchema.safeParse({
        decision: 'DECLINE',
        appointmentId: a.id,
        ...optionalReason,
      });
      if (!parsed.success) {
        setReasonError(formText('range', { min: 3, max: 500 }));
        reasonRef.current?.focus();
        return;
      }
      setReasonError('');
      void run('dialog', () => actions.respond(parsed.data));
    } else if (dialog === 'cancel') {
      const parsed = cancelAppointmentSchema.safeParse({ appointmentId: a.id, ...optionalReason });
      if (!parsed.success) {
        setReasonError(formText('range', { min: 3, max: 500 }));
        reasonRef.current?.focus();
        return;
      }
      setReasonError('');
      void run('dialog', () => actions.cancel(parsed.data));
    }
  }

  function saveLink() {
    setLinkError(undefined);
    const parsed = setMeetLinkSchema.safeParse({ appointmentId: a.id, url: link });
    if (!parsed.success) {
      setLinkError('APPOINTMENT_LINK_INVALID');
      return;
    }
    void run(
      'link',
      () => actions.setMeetLink(parsed.data),
      (code) => setLinkError(code),
    );
  }

  const confirmBlocked = !a.actions.canConfirm && a.actions.confirmBlockedReason !== null;

  return (
    <article
      data-hydrated={hydrated ? 'true' : undefined}
      className="[&_.text-sm]:text-base flex w-full max-w-2xl flex-col gap-6"
    >
      <div>
        <Link
          href="/randevular"
          className="press-row -ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-base font-medium text-primary hover:bg-primary-soft hover:text-on-primary-soft"
        >
          <ChevronLeftIcon aria-hidden="true" />
          {t('back')}
        </Link>
        <Avatar src={a.counterpart.photoSrc} name={a.counterpart.displayName} decorative />
        <PageHeader eyebrow={t('eyebrow')} title={t('with', { name: a.counterpart.displayName })}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AppointmentStatusBadge status={a.status} />
          </div>
        </PageHeader>
      </div>

      {a.role === 'MENTOR' && a.status === 'REQUESTED' && a.studentSummary && (
        <p className="rounded-card border border-border bg-surface p-4 text-base text-fg-muted">
          {feedback('studentSummary', {
            total: a.studentSummary.total,
            interested: a.studentSummary.interested,
            prepared: feedback(a.studentSummary.prepared ? 'preparedGenerally' : 'preparedMixed'),
            punctual: feedback(a.studentSummary.punctual ? 'punctualGenerally' : 'punctualMixed'),
          })}
        </p>
      )}

      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          className="rounded-control bg-success-soft p-3 text-base text-on-success-soft"
        >
          {t('done')}
        </p>
      )}
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}

      <AppointmentTimeline status={a.status} role={a.role} feedbackPending={feedbackAvailable} />

      {a.mode === 'ONLINE' && a.status === 'CONFIRMED' && (
        <section
          className={cn(
            'flex flex-col gap-3 rounded-card border p-4',
            a.meetUrl
              ? 'border-primary bg-primary-soft text-on-primary-soft'
              : 'border-border text-fg',
          )}
          aria-labelledby="meet-title"
        >
          <h2 id="meet-title" className="text-lg font-semibold">
            {t('meet')}
          </h2>
          {a.meetUrl ? (
            <a
              className={buttonClasses({
                size: 'lg',
                fullWidth: true,
                variant: feedbackAvailable ? 'secondary' : 'primary',
              })}
              href={a.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('meetOpen')}
            </a>
          ) : a.actions.canSetLink ? (
            <>
              <p className="text-base text-fg-muted">{t('linkNeeded')}</p>
              <Field
                label={t('linkLabel')}
                hint={t('linkHint')}
                error={linkError ? errors(linkError) : undefined}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                  />
                )}
              </Field>
              <Button loading={pending === 'link'} onClick={saveLink}>
                {t('linkSave')}
              </Button>
            </>
          ) : (
            <p className="text-base text-fg-muted">
              {a.linkNeeded ? t('linkWaiting') : t('meetNone')}
            </p>
          )}
        </section>
      )}

      <dl className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface px-4 shadow-card sm:px-5">
        <div className="py-3">
          <dt className="text-base text-fg-muted">{t('when')}</dt>
          <dd className="text-lg font-semibold text-fg">
            {fullLabel(a.startsAt)}
            <span className="block text-base text-fg-muted">
              {rangeLabel(a.startsAt, a.endsAt)}
            </span>
          </dd>
        </div>
        <div className="py-3">
          <dt className="text-base text-fg-muted">{t('mode')}</dt>
          <dd className="text-base text-fg">{modes(a.mode)}</dd>
        </div>
        {a.mode === 'IN_PERSON' && a.location && (
          <div className="py-3">
            <dt className="text-base text-fg-muted">{t('location')}</dt>
            <dd className="whitespace-pre-line break-words text-base text-fg">{a.location}</dd>
          </div>
        )}
        <div className="py-3">
          <dt className="text-base text-fg-muted">{t('note')}</dt>
          <dd className="whitespace-pre-line break-words text-base text-fg">
            {a.note ?? t('noteNone')}
          </dd>
        </div>
        {a.status === 'REQUESTED' && a.expiresAt && (
          <div className="py-3">
            <dd className="text-base text-fg-muted">
              {t('expiresAt', { date: fullLabel(a.expiresAt) })}
            </dd>
          </div>
        )}
        {(a.status === 'CANCELLED' || a.status === 'DECLINED' || a.status === 'EXPIRED') && (
          <div className="py-3">
            {a.cancelledBy && (
              <dd className="text-base text-fg">{t(`cancelledBy.${a.cancelledBy}`)}</dd>
            )}
            {a.cancelReason && (
              <dd className="whitespace-pre-line break-words text-base text-fg-muted">
                {t('cancelReasonShown', { reason: a.cancelReason })}
              </dd>
            )}
          </div>
        )}
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {feedbackAvailable && (
          <Link
            className={buttonClasses() + ' w-full sm:w-auto'}
            href={`/hesap/gorusme/${encodeURIComponent(a.id)}`}
          >
            {feedback('open')}
          </Link>
        )}
        {confirmBlocked && (
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled
            disabledReason={
              a.actions.confirmBlockedReason === 'CAPACITY_FULL' ? t('capacityFull') : t('expired')
            }
          >
            {t('confirm')}
          </Button>
        )}
        {a.actions.canConfirm && (
          <Button
            size="lg"
            className="w-full sm:w-auto"
            loading={pending === 'confirm'}
            onClick={() =>
              void run('confirm', () =>
                actions.respond({ decision: 'CONFIRM', appointmentId: a.id }),
              )
            }
          >
            {t('confirm')}
          </Button>
        )}
        {a.actions.canDecline && (
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => openDialog('decline')}
          >
            {t('decline')}
          </Button>
        )}
        {a.actions.canDownloadIcs && (
          <a
            className={buttonClasses({ variant: 'secondary' }) + ' w-full sm:w-auto'}
            href={appointmentIcsHref(a.id)}
            download
          >
            {t('ics')}
          </a>
        )}
        {a.actions.canCancel && (
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => openDialog('cancel')}>
            {t('cancel')}
          </Button>
        )}
        {a.role === 'MENTOR' && a.status === 'CONFIRMED' && a.actions.canCancel && (
          <p className="w-full text-base text-fg-muted">{t('mentorCancelHint')}</p>
        )}
        {a.status === 'CONFIRMED' && (
          <p className="w-full text-base text-fg-muted">{t('emailShared')}</p>
        )}
      </div>

      <Modal
        open={dialog !== undefined}
        onClose={() => !pending && setDialog(undefined)}
        title={dialog === 'decline' ? t('declineTitle') : t('cancelTitle')}
        description={dialog === 'decline' ? t('declineDescription') : t('cancelDescription')}
        footer={
          <>
            <Button
              variant="danger"
              fullWidth
              loading={pending === 'dialog'}
              onClick={submitDialog}
            >
              {dialog === 'decline' ? t('declineConfirm') : t('cancelConfirm')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setDialog(undefined)}>
              {t('keep')}
            </Button>
          </>
        }
      >
        <Field
          label={dialog === 'decline' ? t('declineReason') : t('cancelReason')}
          hint={formText('counter', { count: userTextLength(reason), max: 500 })}
          error={reasonError || undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              ref={reasonRef}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError('');
              }}
            />
          )}
        </Field>
      </Modal>
    </article>
  );
}
