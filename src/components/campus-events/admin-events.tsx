'use client';
import { useQueueFocus } from '@/components/admin/use-queue-focus';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  buttonClasses,
  CalendarIcon,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
  useAction,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import {
  cancelCampusEventSchema,
  createCampusEventSchema,
  reviewCampusEventSchema,
} from '@/contracts/campus-events';
import {
  cancelCampusEvent,
  createCampusEvent,
  reviewCampusEvent,
} from '@/server/actions/campus-events';

type Item = {
  id: string;
  title: string;
  startsAt: Date;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'CANCELLED';
};
const STATUS_TONES: Record<Item['status'], BadgeTone> = {
  PENDING: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};
/** Satırı geçici olarak odaklanabilir yapar; odak ayrılınca ek sekme durağı bırakmaz. */
function focusTemporarily(element: HTMLElement) {
  element.setAttribute('tabindex', '-1');
  element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  element.focus();
}
export function AdminEvents({
  departments,
  events,
}: {
  departments: { id: string; name: string }[];
  events: Item[];
}) {
  const { rootRef: queueRef, complete: completeDecision } = useQueueFocus();
  const t = useTranslations('campusEvents'),
    ui = useTranslations('ui'),
    errors = useTranslations('errors.codes'),
    router = useRouter(),
    action = useAction();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(''),
    [intent, setIntent] = useState<{ event: Item; kind: 'PUBLISH' | 'REJECT' | 'CANCEL' } | null>(
      null,
    ),
    [reasonError, setReasonError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  // İptalde kart kuyruktan değil yalnız durumundan çıkar; iptal düğmesi kalkınca odak kartın kendisine gelir.
  const cancelledId = useRef<string | null>(null);
  useEffect(() => {
    const id = cancelledId.current;
    if (!id) return;
    const row = Array.from(
      queueRef.current?.querySelectorAll<HTMLElement>('[data-event-row]') ?? [],
    ).find((element) => element.dataset.eventRow === id);
    // Sunucu yenilemesi sürerken durum henüz değişmedi: bekle.
    if (row && row.dataset.eventStatus !== 'CANCELLED') return;
    cancelledId.current = null;
    if (row) focusTemporarily(row);
  }, [events, queueRef]);
  const labels = {
    PENDING: t('pending'),
    PUBLISHED: t('published'),
    REJECTED: t('rejected'),
    CANCELLED: t('cancelled'),
  };
  function create(formElement: HTMLFormElement) {
    const form = new FormData(formElement);
    const startAt = String(form.get('startsAt') ?? ''),
      endAt = String(form.get('endsAt') ?? '');
    const asIstanbul = (value: string) => `${value}${value.length === 16 ? ':00' : ''}+03:00`;
    const startDate = new Date(asIstanbul(startAt)),
      endDate = new Date(asIstanbul(endAt));
    if (
      !startAt ||
      !endAt ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setFieldErrors({ startsAt: t('timeInvalid') });
      return;
    }
    const parsed = createCampusEventSchema.safeParse({
      title: form.get('title'),
      description: form.get('description'),
      location: form.get('location'),
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      capacity: Number(form.get('capacity')),
      departmentIds: form.getAll('departments'),
    });
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), errors('VALIDATION_INVALID')]),
        ),
      );
      return;
    }
    // Başarıda form temizlenir ve toast gösterilir; hatada girilen HİÇBİR değer silinmez.
    void action.run(() => createCampusEvent(parsed.data), {
      success: t('created'),
      onOk: () => {
        setFieldErrors({});
        formElement.reset();
        router.refresh();
      },
      onFailure: (failure) =>
        setFieldErrors(
          Object.fromEntries(
            Object.entries(failure.fieldErrors ?? {}).map(([field, code]) => [field, errors(code)]),
          ),
        ),
    });
  }
  function closeDecision() {
    action.clear();
    setIntent(null);
    setReason('');
    setReasonError('');
  }
  function openDecision(event: Item, kind: 'PUBLISH' | 'REJECT' | 'CANCEL') {
    setReason('');
    setReasonError('');
    action.clear();
    setIntent({ event, kind });
  }
  function decide() {
    if (!intent || action.busy) return;
    const { event, kind } = intent;
    const input = { eventId: event.id, reason, ...(kind === 'CANCEL' ? {} : { decision: kind }) };
    const parsed = (
      kind === 'CANCEL' ? cancelCampusEventSchema : reviewCampusEventSchema
    ).safeParse(input);
    if (!parsed.success) {
      setReasonError(
        reason.trim().length < 3 ? errors('AUDIT_REASON_REQUIRED') : errors('VALIDATION_INVALID'),
      );
      reasonRef.current?.focus();
      return;
    }
    setReasonError('');
    void action.run(
      () =>
        kind === 'CANCEL'
          ? cancelCampusEvent({ eventId: event.id, reason: parsed.data.reason })
          : reviewCampusEvent({ eventId: event.id, decision: kind, reason: parsed.data.reason }),
      {
        success: t(
          kind === 'PUBLISH'
            ? 'decidedPublished'
            : kind === 'REJECT'
              ? 'decidedRejected'
              : 'decidedCancelled',
        ),
        // Başarıda pencere kapanır ve gerekçe silinir; hatada pencere ve gerekçe korunur.
        onOk: () => {
          if (kind === 'CANCEL') cancelledId.current = event.id;
          else completeDecision(event.id);
          closeDecision();
          router.refresh();
        },
      },
    );
  }
  const fields = [
    ['title', 'name', 'text'],
    ['description', 'detailsLabel', 'textarea'],
    ['location', 'place', 'text'],
    ['startsAt', 'start', 'datetime-local'],
    ['endsAt', 'end', 'datetime-local'],
    ['capacity', 'capacity', 'number'],
  ] as const;
  const pendingEvents = events.filter((event) => event.status === 'PENDING');
  const otherEvents = events.filter((event) => event.status !== 'PENDING');
  function eventCards(items: Item[]) {
    return (
      <ul className="space-y-3">
        {items.map((event) => (
          <Card
            as="li"
            data-queue-row={event.status === 'PENDING' ? event.id : undefined}
            data-event-row={event.id}
            data-event-status={event.status}
            key={event.id}
            className="list-none"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 break-words font-semibold">{event.title}</h3>
              <Badge tone={STATUS_TONES[event.status]}>{labels[event.status]}</Badge>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-fg-muted">
              <CalendarIcon width={16} height={16} className="shrink-0" />
              {new Intl.DateTimeFormat('tr-TR', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Europe/Istanbul',
              }).format(new Date(event.startsAt))}
            </p>
            {event.status === 'PENDING' && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  data-queue-action
                  loading={action.busy}
                  onClick={() => openDecision(event, 'PUBLISH')}
                >
                  {t('approve')}
                </Button>
                <Button
                  variant="danger-outline"
                  loading={action.busy}
                  onClick={() => openDecision(event, 'REJECT')}
                >
                  {t('reject')}
                </Button>
              </div>
            )}
            {event.status === 'PUBLISHED' && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  className={buttonClasses({ variant: 'secondary' })}
                  href={`/yonetim/etkinlikler/${event.id}`}
                  aria-label={ui('namedAction', { action: t('present'), target: event.title })}
                >
                  {t('present')}
                </Link>
                <Button variant="danger-outline" onClick={() => openDecision(event, 'CANCEL')}>
                  {t('cancel')}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </ul>
    );
  }
  return (
    <div ref={queueRef} className="space-y-8">
      {action.error && !intent && (
        <p role="alert" className="text-danger">
          {action.error}
        </p>
      )}
      <section aria-label={t('pendingTitle')} className="space-y-4">
        <h2 data-queue-heading className="text-xl font-semibold">
          {t('pendingTitle')}
        </h2>
        {pendingEvents.length ? (
          eventCards(pendingEvents)
        ) : (
          <EmptyState
            icon={<CalendarIcon width={32} height={32} />}
            title={t('pendingEmpty')}
            description={t('pendingEmptyDescription')}
          />
        )}
      </section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create(event.currentTarget);
        }}
      >
        <Card className="mt-6 space-y-5">
          <h2 className="text-xl font-semibold">{t('create')}</h2>
          {fields.map(([name, label, type]) => (
            <Field
              key={name}
              label={t(label)}
              required
              hint={type === 'datetime-local' ? t('dateTimeHint') : undefined}
              error={fieldErrors[name]}
            >
              {(control) =>
                type === 'textarea' ? (
                  <Textarea {...control} name={name} />
                ) : (
                  <Input
                    {...control}
                    name={name}
                    type={type}
                    min={type === 'number' ? 1 : undefined}
                    inputMode={type === 'number' ? 'numeric' : undefined}
                  />
                )
              }
            </Field>
          ))}
          <fieldset>
            <legend className="font-medium text-fg">{t('departments')}</legend>
            {departments.map((d) => (
              <Checkbox key={d.id} name="departments" value={d.id} label={d.name} />
            ))}
            {fieldErrors.departmentIds && (
              <p role="alert" className="text-sm text-danger">
                {fieldErrors.departmentIds}
              </p>
            )}
          </fieldset>
          <Button type="submit" size="lg" fullWidth loading={action.busy}>
            {action.busy ? t('registering') : t('submit')}
          </Button>
        </Card>
      </form>
      {otherEvents.length > 0 && (
        <section aria-label={t('managedTitle')} className="space-y-4">
          <h2 className="text-xl font-semibold">{t('managedTitle')}</h2>
          {eventCards(otherEvents)}
        </section>
      )}
      <Modal
        open={intent !== null}
        onClose={() => {
          if (!action.busy) closeDecision();
        }}
        title={t(
          intent?.kind === 'CANCEL' ? 'cancel' : intent?.kind === 'REJECT' ? 'reject' : 'approve',
        )}
        description={t(intent?.kind === 'CANCEL' ? 'cancelConfirm' : 'reviewConfirm')}
        footer={
          <>
            <Button variant="secondary" loading={action.busy} onClick={closeDecision}>
              {t('dismiss')}
            </Button>
            <Button
              variant={intent?.kind === 'PUBLISH' ? 'primary' : 'danger'}
              loading={action.busy}
              onClick={decide}
            >
              {t(
                intent?.kind === 'CANCEL'
                  ? 'cancel'
                  : intent?.kind === 'REJECT'
                    ? 'reject'
                    : 'approve',
              )}
            </Button>
          </>
        }
      >
        <p className="mb-4 font-semibold">{intent?.event.title}</p>
        <Field label={t('reason')} hint={t('reasonHint')} required error={reasonError || undefined}>
          {(control) => (
            <Textarea
              {...control}
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {action.error && (
          <p role="alert" className="mt-3 text-danger">
            {action.error}
          </p>
        )}
      </Modal>
    </div>
  );
}
