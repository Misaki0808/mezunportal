'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { RequestAppointmentInput, SlotList } from '@/contracts/appointment';
import { APPOINTMENT_NOTE_MAX, requestAppointmentSchema } from '@/contracts/appointment';
import type { ActionResult } from '@/contracts/result';
import {
  Button,
  CalendarIcon,
  EmptyState,
  Field,
  PageHeader,
  RadioGroup,
  Textarea,
  buttonClasses,
  useAction,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { dayLabel, groupSlotsByDay, shortDayLabel, timeLabel } from './time';

type Props = {
  list: SlotList;
  request: (input: RequestAppointmentInput) => Promise<ActionResult<unknown>>;
};

/**
 * Randevu talebi: gün → saat → biçim → not → gönder. 390 px'te başparmakla rahat: gün çipleri yatay kayar, saat düğmeleri
 * ≥ 44 px ve 3 sütun, ana eylem altta yapışkan. Talep yalnız sunucunun ürettiği slota yapılır; ekran ipucu verir.
 */
export function SlotPicker({ list, request }: Props) {
  const t = useTranslations('appointments.request');
  const modesT = useTranslations('appointments.modes');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [rejected, setRejected] = useState<{ source: SlotList['slots']; startsAt: string[] }>();
  const excluded = rejected?.source === list.slots ? rejected.startsAt : [];
  const slots = list.slots.filter(
    (item) => !excluded.includes(new Date(item.startsAt).toISOString()),
  );
  const groups = groupSlotsByDay(slots);
  const [dayKeySelected, setDayKey] = useState(groups[0]?.key);
  const [startsAt, setStartsAt] = useState<string>();
  const [mode, setMode] = useState<string>();
  const [note, setNote] = useState('');
  const [error, setError] = useState<ErrorCode>();
  const [needSlot, setNeedSlot] = useState(false);
  const action = useAction();
  const pending = action.busy;
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const day = groups.find((group) => group.key === dayKeySelected) ?? groups[0];
  const slot = slots.find((item) => new Date(item.startsAt).toISOString() === startsAt);
  const modes = slot?.modes ?? [];
  const effectiveMode =
    mode && modes.includes(mode as 'ONLINE') ? mode : modes.length === 1 ? modes[0] : undefined;

  async function submit() {
    if (!slot) {
      setNeedSlot(true);
      return;
    }
    const input = {
      mentorId: list.mentor.userId,
      startsAt: new Date(slot.startsAt),
      mode: effectiveMode,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const parsed = requestAppointmentSchema.safeParse(input);
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    setError(undefined);
    setNeedSlot(false);
    await action.run(() => request(parsed.data), {
      success: t('sent'),
      onOk: () => setDone(true),
      onFailure: (failure) => {
        setError(failure.errorCode);
        if (['APPOINTMENT_SLOT_TAKEN', 'APPOINTMENT_SLOT_INVALID'].includes(failure.errorCode)) {
          setRejected((current) => ({
            source: list.slots,
            startsAt: [
              ...(current?.source === list.slots ? current.startsAt : []),
              new Date(slot.startsAt).toISOString(),
            ],
          }));
          setStartsAt(undefined);
          setMode(undefined);
          router.refresh();
        }
      },
    });
  }

  const header = (
    <PageHeader eyebrow={t('eyebrow')} title={t('title', { name: list.mentor.displayName })} />
  );

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-5 py-14 text-center">
        <h1
          ref={doneRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-fg focus:outline-none"
        >
          {t('sent')}
        </h1>
        <p role="status" className="text-base text-fg-muted">
          {t('sentDescription')}
        </p>
        <Link className={buttonClasses({ size: 'lg', fullWidth: true })} href="/randevular">
          {t('sentAction')}
        </Link>
      </div>
    );
  }

  // Boş durum: sebep sıcak bir dille yazılır; tek eylem "Mentor bul" (başka mentora geçmek).
  if (list.unavailableReason || groups.length === 0) {
    return (
      <div className="mx-auto w-full max-w-lg px-5 pb-10 pt-10 sm:pt-16">
        {header}
        {error && (
          <p role="alert" className="mt-4 text-base text-danger">
            {errors(error)}
          </p>
        )}
        <EmptyState
          icon={<CalendarIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('unavailableTitle')}
          description={
            list.unavailableReason ? t(`unavailable.${list.unavailableReason}`) : t('noSlots')
          }
          action={
            <Link className={buttonClasses({ size: 'lg' })} href="/mentorlar">
              {t('findMentor')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="[&_.text-sm]:text-base mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-10 sm:pt-16"
    >
      {header}
      <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      <p className="mt-1 text-base text-fg-muted">{t('timezone')}</p>

      <fieldset className="mt-6 min-w-0">
        <legend className="mb-2 font-medium text-fg">{t('pickDay')}</legend>
        <div
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2"
          role="radiogroup"
          aria-label={t('pickDay')}
        >
          {groups.map((group) => {
            const selected = group.key === day?.key;
            return (
              <button
                key={group.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setDayKey(group.key);
                  setStartsAt(undefined);
                  setMode(undefined);
                }}
                className={
                  'press-control min-h-14 shrink-0 rounded-control border px-4 text-base font-medium ' +
                  (selected
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border-control bg-bg text-fg')
                }
              >
                {shortDayLabel(group.date)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {day && (
        <fieldset className="mt-4 min-w-0">
          <legend className="mb-2 font-medium text-fg">
            {t('pickTime')} ·{' '}
            <span className="font-normal text-fg-muted">{dayLabel(day.date)}</span>
          </legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('pickTime')}>
            {day.slots.map((item) => {
              const iso = new Date(item.startsAt).toISOString();
              const selected = iso === startsAt;
              return (
                <button
                  key={iso}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t('timeLabel', { time: timeLabel(item.startsAt) })}
                  onClick={() => {
                    setStartsAt(iso);
                    setNeedSlot(false);
                    setMode(undefined);
                  }}
                  className={
                    'press-control min-h-12 rounded-control border text-base font-medium ' +
                    (selected
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-border-control bg-bg text-fg')
                  }
                >
                  {timeLabel(item.startsAt)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {slot && modes.length > 1 && (
        <div className="mt-5">
          <RadioGroup
            legend={t('mode')}
            name="mode"
            value={effectiveMode ?? ''}
            onValueChange={setMode}
            options={modes.map((value) => ({ value, label: modesT(value) }))}
          />
        </div>
      )}
      {slot && modes.length === 1 && (
        <p className="mt-5 text-base text-fg">
          <span className="font-medium">{t('mode')}: </span>
          {modesT(modes[0]!)}
        </p>
      )}
      {slot && effectiveMode === 'IN_PERSON' && list.mentor.inPersonNote && (
        <p className="mt-2 break-words text-base text-fg-muted [overflow-wrap:anywhere]">
          {t('place', { note: list.mentor.inPersonNote })}
        </p>
      )}

      <Field className="mt-5" label={t('note')} hint={t('noteHint')}>
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            maxLength={APPOINTMENT_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      <p className="mt-3 text-base text-fg-muted">{t('emailShared')}</p>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-auto space-y-2 bg-bg pt-4 pb-2 lg:static lg:pt-8">
        {needSlot && (
          <p role="alert" className="text-base text-danger">
            {t('chooseSlot')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-base text-danger">
            {errors(error)}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
