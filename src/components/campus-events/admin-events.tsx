'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Modal } from '@/components/ui';
import { createCampusEventSchema } from '@/contracts/campus-events';
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
    [cancelId, setCancelId] = useState<string | null>(null);
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
      const result = await createCampusEvent(parsed.data);
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
  function decide(eventId: string, kind: 'PUBLISH' | 'REJECT' | 'CANCEL') {
    start(async () => {
      const result =
        kind === 'CANCEL'
          ? await cancelCampusEvent({ eventId, reason })
          : await reviewCampusEvent({ eventId, decision: kind, reason });
      setStatus(
        result.ok
          ? t(kind === 'PUBLISH' ? 'published' : kind === 'REJECT' ? 'rejected' : 'cancelled')
          : errors(result.errorCode),
      );
      if (result.ok) {
        setCancelId(null);
        router.refresh();
      }
    });
  }
  const field = 'min-h-12 w-full rounded-xl border border-border bg-surface px-3';
  return (
    <div className="space-y-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create(new FormData(event.currentTarget));
        }}
        className="mt-6 space-y-4 rounded-card border border-border p-5"
      >
        <h2 className="text-xl font-semibold">{t('create')}</h2>
        {(
          [
            ['title', 'name', 'text'],
            ['description', 'detailsLabel', 'text'],
            ['location', 'place', 'text'],
            ['startsAt', 'start', 'datetime-local'],
            ['endsAt', 'end', 'datetime-local'],
            ['capacity', 'capacity', 'number'],
          ] as const
        ).map(([name, label, type]) => (
          <label key={name} className="block space-y-2">
            <span className="font-semibold">{t(label!)}</span>
            <input
              className={field}
              name={name}
              type={type}
              min={type === 'number' ? 1 : undefined}
              aria-invalid={!!fieldErrors[name]}
              aria-describedby={fieldErrors[name] ? `campus-error-${name}` : undefined}
              required
            />
            {fieldErrors[name] && (
              <span id={`campus-error-${name}`} className="block text-danger">
                {fieldErrors[name]}
              </span>
            )}
          </label>
        ))}
        <fieldset>
          <legend className="font-semibold">{t('departments')}</legend>
          {departments.map((d) => (
            <label key={d.id} className="mt-2 flex min-h-11 items-center gap-3">
              <input type="checkbox" name="departments" value={d.id} />
              {d.name}
            </label>
          ))}
          {fieldErrors.departmentIds && <p className="text-danger">{fieldErrors.departmentIds}</p>}
        </fieldset>
        <button
          disabled={pending}
          className="min-h-12 w-full rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? t('registering') : t('submit')}
        </button>
      </form>
      <label className="block space-y-2">
        <span className="font-semibold">{t('reason')}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
      </label>
      {status && <p role="status">{status}</p>}
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="rounded-card border border-border p-5">
            <h2 className="font-semibold">{event.title}</h2>
            <p>{labels[event.status]}</p>
            <p>
              {new Intl.DateTimeFormat('tr-TR', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Europe/Istanbul',
              }).format(new Date(event.startsAt))}
            </p>
            {event.status === 'PENDING' && (
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => decide(event.id, 'PUBLISH')}
                  className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
                >
                  {t('approve')}
                </button>
                <button
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => decide(event.id, 'REJECT')}
                  className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
                >
                  {t('reject')}
                </button>
              </div>
            )}
            {event.status === 'PUBLISHED' && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  className="inline-flex min-h-11 items-center text-primary underline"
                  href={`/yonetim/etkinlikler/${event.id}`}
                >
                  {t('present')}
                </Link>
                <button
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => {
                    setStatus('');
                    setCancelId(event.id);
                  }}
                  className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={cancelId !== null}
        onClose={() => setCancelId(null)}
        title={t('cancel')}
        description={t('cancelConfirm')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelId(null)}>
              {t('dismiss')}
            </Button>
            <Button
              {...(pending || reason.trim().length < 3
                ? {
                    disabled: true as const,
                    disabledReason: pending ? t('registering') : t('reason'),
                  }
                : { disabled: false as const })}
              onClick={() => {
                if (cancelId) decide(cancelId, 'CANCEL');
              }}
            >
              {t('cancel')}
            </Button>
          </>
        }
      >
        {status && <p role="alert">{status}</p>}
      </Modal>
    </div>
  );
}
