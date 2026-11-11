'use client';
import Link from 'next/link';
import { safeClientAction } from '@/lib/safe-client-action';
import { useRef, useState, useTransition } from 'react';
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
export function AdminEvents({
  departments,
  events,
}: {
  departments: { id: string; name: string }[];
  events: Item[];
}) {
  const t = useTranslations('campusEvents'),
    errors = useTranslations('errors.codes'),
    router = useRouter();
  const [pending, start] = useTransition(),
    [status, setStatus] = useState(''),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(''),
    [intent, setIntent] = useState<{ event: Item; kind: 'PUBLISH' | 'REJECT' | 'CANCEL' } | null>(
      null,
    ),
    [reasonError, setReasonError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const labels = {
    PENDING: t('pending'),
    PUBLISHED: t('published'),
    REJECTED: t('rejected'),
    CANCELLED: t('cancelled'),
  };
  function create(form: FormData) {
    start(async () => {
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
            parsed.error.issues.map((issue) => [
              String(issue.path[0]),
              errors('VALIDATION_INVALID'),
            ]),
          ),
        );
        return;
      }
      const result = await safeClientAction(() => createCampusEvent(parsed.data));
      setFieldErrors(
        result.ok
          ? {}
          : Object.fromEntries(
              Object.entries(result.fieldErrors ?? {}).map(([field, code]) => [
                field,
                errors(code),
              ]),
            ),
      );
      setStatus(result.ok ? t('pending') : errors(result.errorCode));
      if (result.ok) router.refresh();
    });
  }
  function closeDecision() {
    setIntent(null);
    setReason('');
    setReasonError('');
  }
  function openDecision(event: Item, kind: 'PUBLISH' | 'REJECT' | 'CANCEL') {
    setReason('');
    setReasonError('');
    setStatus('');
    setIntent({ event, kind });
  }
  function decide() {
    if (!intent || pending) return;
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
    start(async () => {
      const result =
        kind === 'CANCEL'
          ? await safeClientAction(() =>
              cancelCampusEvent({ eventId: event.id, reason: parsed.data.reason }),
            )
          : await safeClientAction(() =>
              reviewCampusEvent({ eventId: event.id, decision: kind, reason: parsed.data.reason }),
            );
      setStatus(
        result.ok
          ? t(kind === 'PUBLISH' ? 'published' : kind === 'REJECT' ? 'rejected' : 'cancelled')
          : errors(result.errorCode),
      );
      if (result.ok) {
        closeDecision();
        router.refresh();
      }
    });
  }
  const fields = [
    ['title', 'name', 'text'],
    ['description', 'detailsLabel', 'textarea'],
    ['location', 'place', 'text'],
    ['startsAt', 'start', 'datetime-local'],
    ['endsAt', 'end', 'datetime-local'],
    ['capacity', 'capacity', 'number'],
  ] as const;
  return (
    <div className="space-y-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create(new FormData(event.currentTarget));
        }}
      >
        <Card className="mt-6 space-y-5">
          <h2 className="text-xl font-semibold">{t('create')}</h2>
          {fields.map(([name, label, type]) => (
            <Field key={name} label={t(label)} required error={fieldErrors[name]}>
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
          <Button type="submit" size="lg" fullWidth loading={pending}>
            {pending ? t('registering') : t('submit')}
          </Button>
        </Card>
      </form>
      {events.length === 0 ? (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          icon={<CalendarIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <section className="space-y-4">
          {status && (
            <p role="status" className="text-fg-muted">
              {status}
            </p>
          )}
          <ul className="space-y-3">
            {events.map((event) => (
              <Card as="li" key={event.id} className="list-none">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words font-semibold">{event.title}</h2>
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
                    <Button loading={pending} onClick={() => openDecision(event, 'PUBLISH')}>
                      {t('approve')}
                    </Button>
                    <Button
                      variant="danger-outline"
                      loading={pending}
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
        </section>
      )}
      <Modal
        open={intent !== null}
        onClose={() => {
          if (!pending) closeDecision();
        }}
        title={t(
          intent?.kind === 'CANCEL' ? 'cancel' : intent?.kind === 'REJECT' ? 'reject' : 'approve',
        )}
        description={t(intent?.kind === 'CANCEL' ? 'cancelConfirm' : 'reviewConfirm')}
        footer={
          <>
            <Button variant="secondary" loading={pending} onClick={closeDecision}>
              {t('dismiss')}
            </Button>
            <Button
              variant={intent?.kind === 'PUBLISH' ? 'primary' : 'danger'}
              loading={pending}
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
        {status && <p role="alert">{status}</p>}
      </Modal>
    </div>
  );
}
