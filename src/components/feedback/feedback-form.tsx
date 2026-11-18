'use client';
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AccountFrameView } from '@/components/account/account-frame';
import { Button, Field, Radio, Textarea } from '@/components/ui';
import { feedbackInputSchema, type FeedbackView } from '@/contracts/feedback';
import type { ErrorCode } from '@/lib/errors';
import { submitSessionFeedback } from '@/server/actions/feedback';

export function FeedbackForm({ view }: { view: FeedbackView }) {
  const t = useTranslations('feedback');
  const errors = useTranslations('errors.codes');
  const frame = useTranslations('accountFrame');
  const [happened, setHappened] = useState<boolean | null>(null);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(view.submitted);
  const [error, setError] = useState<ErrorCode>();
  const [happenedInvalid, setHappenedInvalid] = useState(false);
  const [noteError, setNoteError] = useState<ErrorCode>();
  const happenedErrorId = useId();
  const firstHappened = useRef<HTMLInputElement>(null);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    setError(undefined);
    const parsed = feedbackInputSchema.safeParse({
      appointmentId: view.appointmentId,
      happened,
      helpful: happened ? helpful : null,
      note: note.trim() || null,
    });
    setHappenedInvalid(false);
    setNoteError(undefined);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === 'happened')) {
        setHappenedInvalid(true);
        firstHappened.current?.focus();
      } else if (parsed.error.issues.some((issue) => issue.path[0] === 'note')) {
        setNoteError('VALIDATION_INVALID');
        noteField.current?.focus();
      } else setError('VALIDATION_INVALID');
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      const result = await submitSessionFeedback(parsed.data);
      if (!result.ok) {
        if (result.fieldErrors?.happened) {
          setHappenedInvalid(true);
          firstHappened.current?.focus();
        } else if (result.fieldErrors?.note) {
          setNoteError(result.fieldErrors.note);
          noteField.current?.focus();
        } else setError(result.errorCode);
      } else setDone(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return (
    <AccountFrameView
      eyebrow={frame('eyebrow')}
      backLabel={t('backToSessions')}
      back={{ href: '/hesap/gorusmeler' }}
      title={t('title')}
      description={t('description')}
      width="max-w-2xl"
    >
      <p className="font-medium">
        {view.counterpartName} ·{' '}
        {new Intl.DateTimeFormat('tr-TR', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Europe/Istanbul',
        }).format(new Date(view.startsAt))}
      </p>
      {done ? (
        <p role="status" className="rounded-card bg-success-soft p-4">
          {view.submitted ? t('already') : t('success')}
        </p>
      ) : (
        <form
          noValidate
          className="flex flex-1 flex-col gap-6"
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
                  <Radio
                    name="happened"
                    required
                    ref={value ? firstHappened : undefined}
                    aria-invalid={happenedInvalid || undefined}
                    aria-describedby={happenedInvalid ? happenedErrorId : undefined}
                    checked={happened === value}
                    onChange={() => {
                      setHappened(value);
                      setHappenedInvalid(false);
                    }}
                  />
                  {t(value ? 'yes' : view.role === 'MENTOR' ? 'noMentor' : 'no')}
                </label>
              ))}
            </div>
            {happenedInvalid && (
              <p id={happenedErrorId} role="alert" className="mt-2 text-danger">
                {t('happenedRequired')}
              </p>
            )}
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
                    <Radio
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
          <Field
            className="[&_.text-sm]:text-base"
            label={t('note')}
            hint={t('optional')}
            error={
              noteError
                ? noteError === 'VALIDATION_INVALID' && note.trim().length > 1000
                  ? t('noteTooLong')
                  : errors(noteError)
                : undefined
            }
          >
            {(control) => (
              <Textarea
                {...control}
                ref={noteField}
                value={note}
                rows={4}
                onChange={(event) => {
                  setNote(event.target.value);
                  setNoteError(undefined);
                }}
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
    </AccountFrameView>
  );
}
