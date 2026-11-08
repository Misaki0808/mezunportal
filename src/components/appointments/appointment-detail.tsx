'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import {
  appointmentIcsHref,
  setMeetLinkSchema,
  type AppointmentView,
  type CancelAppointmentInput,
  type RespondAppointmentInput,
  type SetMeetLinkInput,
} from '@/contracts/appointment';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Input, Modal, PageHeader, Textarea, buttonClasses } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

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
  const modes = useTranslations('appointments.modes');
  const feedback = useTranslations('feedback');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [dialog, setDialog] = useState<'decline' | 'cancel'>();
  const [reason, setReason] = useState('');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<ErrorCode>();
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState(false);
  const [pending, setPending] = useState<string>();
  const locked = useRef(false);
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
    <article className="[&_.text-sm]:text-base mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pb-10 pt-10 sm:pt-16">
      <div>
        <Link
          href="/randevular"
          className="press-row mb-4 inline-flex min-h-11 items-center text-base font-medium text-primary"
        >
          ← {t('back')}
        </Link>
        <PageHeader eyebrow={t('eyebrow')} title={t('with', { name: a.counterpart.displayName })}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AppointmentStatusBadge status={a.status} />
          </div>
        </PageHeader>
      </div>

      {notice && (
        <p
          role="status"
          className="rounded-control bg-success-soft p-3 text-base text-on-success-soft"
        >
          {t('done')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}

      <dl className="flex flex-col gap-3">
        <div>
          <dt className="text-base text-fg-muted">{t('when')}</dt>
          <dd className="text-base text-fg">
            {fullLabel(a.startsAt)}
            <span className="block text-base text-fg-muted">
              {rangeLabel(a.startsAt, a.endsAt)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-base text-fg-muted">{t('mode')}</dt>
          <dd className="text-base text-fg">{modes(a.mode)}</dd>
        </div>
        {a.mode === 'IN_PERSON' && a.location && (
          <div>
            <dt className="text-base text-fg-muted">{t('location')}</dt>
            <dd className="whitespace-pre-line break-words text-base text-fg">{a.location}</dd>
          </div>
        )}
        <div>
          <dt className="text-base text-fg-muted">{t('note')}</dt>
          <dd className="whitespace-pre-line break-words text-base text-fg">
            {a.note ?? t('noteNone')}
          </dd>
        </div>
        {a.status === 'REQUESTED' && a.expiresAt && (
          <div>
            <dd className="text-base text-fg-muted">
              {t('expiresAt', { date: fullLabel(a.expiresAt) })}
            </dd>
          </div>
        )}
        {(a.status === 'CANCELLED' || a.status === 'DECLINED' || a.status === 'EXPIRED') && (
          <div>
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

      {a.mode === 'ONLINE' && a.status === 'CONFIRMED' && (
        <section
          className="flex flex-col gap-3 rounded-card border border-border p-4"
          aria-labelledby="meet-title"
        >
          <h2 id="meet-title" className="text-lg font-semibold text-fg">
            {t('meet')}
          </h2>
          {a.meetUrl ? (
            <a
              className={buttonClasses({ size: 'lg', fullWidth: true })}
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

      <div className="flex flex-col gap-3">
        {feedbackAvailable && (
          <Link
            className={buttonClasses({ fullWidth: true })}
            href={`/hesap/gorusme/${encodeURIComponent(a.id)}`}
          >
            {feedback('open')}
          </Link>
        )}
        {confirmBlocked && (
          <Button
            size="lg"
            fullWidth
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
            fullWidth
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
          <Button variant="secondary" fullWidth onClick={() => setDialog('decline')}>
            {t('decline')}
          </Button>
        )}
        {a.actions.canDownloadIcs && (
          <a
            className={buttonClasses({ variant: 'secondary', fullWidth: true })}
            href={appointmentIcsHref(a.id)}
            download
          >
            {t('ics')}
          </a>
        )}
        {a.actions.canCancel && (
          <Button variant="ghost" fullWidth onClick={() => setDialog('cancel')}>
            {t('cancel')}
          </Button>
        )}
        {a.status === 'CONFIRMED' && <p className="text-base text-fg-muted">{t('emailShared')}</p>}
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
              onClick={() =>
                void run('dialog', () =>
                  dialog === 'decline'
                    ? actions.respond({
                        decision: 'DECLINE',
                        appointmentId: a.id,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      })
                    : actions.cancel({
                        appointmentId: a.id,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      }),
                )
              }
            >
              {dialog === 'decline' ? t('declineConfirm') : t('cancelConfirm')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setDialog(undefined)}>
              {t('keep')}
            </Button>
          </>
        }
      >
        <Field label={dialog === 'decline' ? t('declineReason') : t('cancelReason')}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
      </Modal>
    </article>
  );
}
