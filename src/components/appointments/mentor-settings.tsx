'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  SESSION_MINUTES,
  AVAILABILITY_RULES_MAX,
  saveAvailabilitySchema,
  saveMentorSettingsSchema,
  type MentorSettingsView,
  type SaveAvailabilityInput,
  type SaveMentorSettingsInput,
  type SetPauseInput,
} from '@/contracts/appointment';
import { MEETING_MODES } from '@/contracts/mentor-directory';
import type { ActionResult } from '@/contracts/result';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  RadioGroup,
  Switch,
  Textarea,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { minutesToTime, timeToMinutes } from './time';

type Result = Promise<ActionResult<unknown>>;
export type MentorSettingsActions = {
  saveSettings: (input: SaveMentorSettingsInput) => Result;
  saveAvailability: (input: SaveAvailabilityInput) => Result;
  setPause: (input: SetPauseInput) => Result;
};

type Range = { start: string; end: string; mode: '' | 'ONLINE' | 'IN_PERSON' };
type Day = { on: boolean; ranges: Range[] };
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function daysFromRules(view: MentorSettingsView): Record<number, Day> {
  const days = Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, { on: false, ranges: [] as Range[] }]),
  ) as Record<number, Day>;
  for (const rule of [...view.rules].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  )) {
    days[rule.weekday]!.on = true;
    days[rule.weekday]!.ranges.push({
      start: minutesToTime(rule.startMinute),
      end: rule.endMinute === 1440 ? '00:00' : minutesToTime(rule.endMinute),
      mode: rule.mode ?? '',
    });
  }
  return days;
}

/** Bitiş günü sonu (İstanbul): seçilen tarihin 23:59'u. */
const pauseDate = (value: string) => new Date(`${value}T23:59:00+03:00`);
const dateInput = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/**
 * Mentor ayarları. Mobilde haftalık müsaitlik GÜN LİSTESİdir: her gün bir anahtar + saat aralıkları (tablo/ızgara yok).
 * Üç bölüm ayrı kaydedilir (genel, müsait değilim, haftalık); doğrulama sözleşme şemalarıyla yapılır, sunucu yeniden denetler.
 */
export function MentorSettings({
  initial,
  actions,
}: {
  initial: MentorSettingsView;
  actions: MentorSettingsActions;
}) {
  const t = useTranslations('appointments.settings');
  const modesT = useTranslations('appointments.modes');
  const weekdays = useTranslations('appointments.weekdays');
  const errors = useTranslations('errors.codes');
  const settings = initial.settings;
  const [capacity, setCapacity] = useState(String(settings?.monthlyCapacity ?? 4));
  const [session, setSession] = useState(String(settings?.sessionMinutes ?? 30));
  const [modes, setModes] = useState<string[]>(settings?.meetingModes ?? ['ONLINE']);
  const [inPersonNote, setInPersonNote] = useState(settings?.inPersonNote ?? '');
  const [isActive, setIsActive] = useState(settings?.isActive ?? true);
  const [paused, setPaused] = useState(Boolean(settings?.pausedUntil));
  const [pausedUntil, setPausedUntil] = useState(dateInput(settings?.pausedUntil ?? null));
  const [days, setDays] = useState(() => daysFromRules(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState<string>();
  const [pending, setPending] = useState<string>();
  const locked = useRef(false);

  async function run(section: string, action: () => Result) {
    if (locked.current) return;
    locked.current = true;
    setPending(section);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await action();
      if (result.ok) setNotice(t('saved'));
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  if (!initial.eligible) {
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-10">
        <EmptyState title={t('notEligibleTitle')} description={t('notEligibleDescription')} />
      </div>
    );
  }

  function saveGeneral() {
    const input = {
      monthlyCapacity: Number(capacity),
      sessionMinutes: Number(session),
      meetingModes: modes,
      inPersonNote: modes.includes('IN_PERSON') && inPersonNote.trim() ? inPersonNote.trim() : null,
      isActive,
    };
    const parsed = saveMentorSettingsSchema.safeParse(input);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'monthlyCapacity') found.capacity = t('errors.capacity');
        else if (key === 'meetingModes') found.modes = t('errors.modes');
        else if (key === 'inPersonNote') found.note = t('errors.note');
      }
      setFieldErrors(found);
      return;
    }
    setFieldErrors({});
    void run('general', () => actions.saveSettings(input as SaveMentorSettingsInput));
  }

  function savePause() {
    if (paused && (!pausedUntil || Number.isNaN(pauseDate(pausedUntil).getTime()))) {
      setFieldErrors({ pause: t('errors.pauseDate') });
      return;
    }
    setFieldErrors({});
    void run('pause', () =>
      actions.setPause({ pausedUntil: paused ? pauseDate(pausedUntil) : null }),
    );
  }

  function saveWeekly() {
    const found: Record<string, string> = {};
    const rules: SaveAvailabilityInput['rules'] = [];
    for (const weekday of WEEKDAYS) {
      const day = days[weekday]!;
      if (!day.on) continue;
      const sorted: { start: number; end: number }[] = [];
      day.ranges.forEach((range, index) => {
        const start = timeToMinutes(range.start);
        const rawEnd = timeToMinutes(range.end);
        const end = rawEnd === 0 ? 1440 : rawEnd;
        const key = `d${weekday}r${index}`;
        if (start === null || end === null || start % 5 !== 0 || end % 5 !== 0)
          found[key] = t('errors.step');
        else if (end <= start) found[key] = t('errors.order');
        else {
          sorted.push({ start, end });
          rules.push({
            weekday,
            startMinute: start,
            endMinute: end,
            mode: range.mode === '' ? null : range.mode,
          });
        }
      });
      sorted.sort((a, b) => a.start - b.start);
      if (sorted.some((range, index) => index > 0 && range.start < sorted[index - 1]!.end))
        found[`d${weekday}`] = t('errors.overlap');
    }
    if (Object.keys(found).length === 0 && !saveAvailabilitySchema.safeParse({ rules }).success)
      found.weekly = t('errors.overlap');
    setFieldErrors(found);
    if (Object.keys(found).length > 0) return;
    void run('weekly', () => actions.saveAvailability({ rules }));
  }

  const updateDay = (weekday: number, patch: Partial<Day>) =>
    setDays((current) => ({ ...current, [weekday]: { ...current[weekday]!, ...patch } }));
  const updateRange = (weekday: number, index: number, patch: Partial<Range>) =>
    updateDay(weekday, {
      ranges: days[weekday]!.ranges.map((range, at) =>
        at === index ? { ...range, ...patch } : range,
      ),
    });
  const ruleCount = WEEKDAYS.reduce(
    (sum, weekday) => sum + (days[weekday]!.on ? days[weekday]!.ranges.length : 0),
    0,
  );

  return (
    <div className="[&_.text-sm]:text-base mx-auto flex w-full max-w-lg flex-col gap-8 px-5 pb-10 pt-10 sm:pt-16">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      {(notice || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={
            error
              ? 'text-base text-danger'
              : 'rounded-control bg-success-soft p-3 text-base text-on-success-soft'
          }
        >
          {error ? errors(error) : notice}
        </p>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="general-title">
        <h2 id="general-title" className="text-xl font-semibold text-fg">
          {t('general')}
        </h2>
        <Field label={t('capacity')} hint={t('capacityHint')} error={fieldErrors.capacity} required>
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={capacity}
              maxLength={2}
              onChange={(event) => setCapacity(event.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        <RadioGroup
          legend={t('session')}
          name="session"
          value={session}
          onValueChange={setSession}
          options={SESSION_MINUTES.map((minutes) => ({
            value: String(minutes),
            label: t('sessionOption', { minutes }),
          }))}
        />
        <fieldset className="flex flex-col">
          <legend className="mb-1 font-medium text-fg">{t('modes')}</legend>
          {MEETING_MODES.map((mode) => (
            <Checkbox
              key={mode}
              label={modesT(mode)}
              checked={modes.includes(mode)}
              onChange={(event) =>
                setModes((current) =>
                  event.target.checked
                    ? [...current, mode]
                    : current.filter((item) => item !== mode),
                )
              }
            />
          ))}
          {fieldErrors.modes && (
            <p role="alert" className="text-base text-danger">
              {fieldErrors.modes}
            </p>
          )}
        </fieldset>
        {modes.includes('IN_PERSON') && (
          <Field
            label={t('inPersonNote')}
            hint={t('inPersonNoteHint')}
            error={fieldErrors.note}
            required
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={300}
                value={inPersonNote}
                onChange={(event) => setInPersonNote(event.target.value)}
              />
            )}
          </Field>
        )}
        <Switch
          label={t('active')}
          description={t('activeHint')}
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={pending === 'general'}
          onClick={saveGeneral}
        >
          {t('saveGeneral')}
        </Button>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="pause-title">
        <h2 id="pause-title" className="text-xl font-semibold text-fg">
          {t('pause')}
        </h2>
        <Switch
          label={t('pause')}
          description={t('pauseHint')}
          checked={paused}
          onChange={(event) => setPaused(event.target.checked)}
        />
        {paused && (
          <Field label={t('pauseUntil')} error={fieldErrors.pause} required>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={pausedUntil}
                onChange={(event) => setPausedUntil(event.target.value)}
              />
            )}
          </Field>
        )}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={pending === 'pause'}
          onClick={savePause}
        >
          {t('pauseSave')}
        </Button>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="weekly-title">
        <h2 id="weekly-title" className="text-xl font-semibold text-fg">
          {t('weekly')}
        </h2>
        <p className="text-base text-fg-muted">{t('weeklyHint')}</p>
        <ul className="flex flex-col gap-3">
          {WEEKDAYS.map((weekday) => {
            const day = days[weekday]!;
            return (
              <li key={weekday} className="rounded-card border border-border p-3">
                <Switch
                  label={weekdays(String(weekday) as '1')}
                  aria-label={t('dayOn', { day: weekdays(String(weekday) as '1') })}
                  checked={day.on}
                  onChange={(event) =>
                    updateDay(weekday, {
                      on: event.target.checked,
                      ranges:
                        event.target.checked && day.ranges.length === 0
                          ? [{ start: '09:00', end: '12:00', mode: '' }]
                          : day.ranges,
                    })
                  }
                />
                {day.on && (
                  <div className="mt-2 flex flex-col gap-3">
                    {day.ranges.map((range, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-2 rounded-control bg-surface p-3"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <Field label={t('from')} error={fieldErrors[`d${weekday}r${index}`]}>
                            {(control) => (
                              <Input
                                {...control}
                                type="time"
                                step={300}
                                value={range.start}
                                onChange={(event) =>
                                  updateRange(weekday, index, { start: event.target.value })
                                }
                              />
                            )}
                          </Field>
                          <Field
                            label={t('to')}
                            hint={range.end === '00:00' ? t('midnightHint') : undefined}
                          >
                            {(control) => (
                              <Input
                                {...control}
                                type="time"
                                step={300}
                                value={range.end}
                                onChange={(event) =>
                                  updateRange(weekday, index, { end: event.target.value })
                                }
                              />
                            )}
                          </Field>
                        </div>
                        {modes.length > 1 && (
                          <Field label={t('rangeMode')}>
                            {(control) => (
                              <select
                                {...{ ...control, invalid: undefined }}
                                value={range.mode}
                                onChange={(event) =>
                                  updateRange(weekday, index, {
                                    mode: event.target.value as Range['mode'],
                                  })
                                }
                                className="block min-h-11 w-full rounded-control border border-border-control bg-bg px-3 text-base text-fg"
                              >
                                <option value="">{t('rangeModeAny')}</option>
                                {MEETING_MODES.filter((mode) => modes.includes(mode)).map(
                                  (mode) => (
                                    <option key={mode} value={mode}>
                                      {modesT(mode)}
                                    </option>
                                  ),
                                )}
                              </select>
                            )}
                          </Field>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() =>
                            updateDay(weekday, {
                              ranges: day.ranges.filter((_, at) => at !== index),
                            })
                          }
                        >
                          {t('removeRange')}
                        </Button>
                      </div>
                    ))}
                    {fieldErrors[`d${weekday}`] && (
                      <p role="alert" className="text-base text-danger">
                        {fieldErrors[`d${weekday}`]}
                      </p>
                    )}
                    {ruleCount < AVAILABILITY_RULES_MAX && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          updateDay(weekday, {
                            ranges: [...day.ranges, { start: '13:00', end: '17:00', mode: '' }],
                          })
                        }
                      >
                        {t('addRange')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {fieldErrors.weekly && (
          <p role="alert" className="text-base text-danger">
            {fieldErrors.weekly}
          </p>
        )}
        <p className="text-base text-fg-muted">{t('summary', { count: ruleCount })}</p>
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 bg-bg pt-2 pb-2 lg:static">
          <Button size="lg" fullWidth loading={pending === 'weekly'} onClick={saveWeekly}>
            {t('saveWeekly')}
          </Button>
        </div>
      </section>
    </div>
  );
}
