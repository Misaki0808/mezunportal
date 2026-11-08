'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, Field, Textarea } from '@/components/ui';
import type { FeedbackView } from '@/contracts/feedback';
import type { ErrorCode } from '@/lib/errors';
import { submitSessionFeedback } from '@/server/actions/feedback';

export function FeedbackForm({ view }: { view: FeedbackView }) {
  const t = useTranslations('feedback');
  const errors = useTranslations('errors.codes');
  const [happened, setHappened] = useState<boolean | null>(null);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(view.submitted);
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (happened === null || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await submitSessionFeedback({
        appointmentId: view.appointmentId,
        happened,
        helpful: happened ? helpful : null,
        note: note.trim() || null,
      });
      if (!result.ok) setError(result.errorCode);
      else setDone(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-xl flex-col px-5 py-8">
      <Link href="/hesap/gorusmeler" className="inline-flex min-h-11 items-center text-primary">
        ← {t('backToSessions')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      <p className="mt-4 font-medium">
        {view.counterpartName} ·{' '}
        {new Intl.DateTimeFormat('tr-TR', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Europe/Istanbul',
        }).format(new Date(view.startsAt))}
      </p>
      {done ? (
        <p role="status" className="mt-8 rounded-card bg-success-soft p-4">
          {view.submitted ? t('already') : t('success')}
        </p>
      ) : (
        <form
          className="mt-7 flex flex-1 flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="font-semibold">{t('happened')}</legend>
            <div className="mt-3 grid gap-2">
              {([true, false] as const).map((value) => (
                <label
                  key={String(value)}
                  className="flex min-h-12 items-center gap-3 rounded-control border border-border px-4"
                >
                  <input
                    type="radio"
                    name="happened"
                    required
                    checked={happened === value}
                    onChange={() => setHappened(value)}
                  />
                  {t(value ? 'yes' : view.role === 'MENTOR' ? 'noMentor' : 'no')}
                </label>
              ))}
            </div>
          </fieldset>
          {happened && (
            <fieldset>
              <legend className="font-semibold">
                {t('helpful')} <span className="font-normal text-fg-muted">({t('optional')})</span>
              </legend>
              <div className="mt-3 grid gap-2">
                {([true, false] as const).map((value) => (
                  <label
                    key={String(value)}
                    className="flex min-h-12 items-center gap-3 rounded-control border border-border px-4"
                  >
                    <input
                      type="radio"
                      name="helpful"
                      checked={helpful === value}
                      onChange={() => setHelpful(value)}
                    />
                    {t(value ? 'helpfulYes' : 'helpfulNo')}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Field className="[&_.text-sm]:text-base" label={t('note')} hint={t('optional')}>
            {(control) => (
              <Textarea
                {...control}
                value={note}
                maxLength={1000}
                rows={4}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-danger">
              {errors(error)}
            </p>
          )}
          <div className="sticky-actions mt-auto bg-bg pb-2 pt-4">
            <Button type="submit" fullWidth size="lg" loading={pending}>
              {pending ? t('sending') : t('submit')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
