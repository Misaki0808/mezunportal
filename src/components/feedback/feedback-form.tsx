'use client';
import { userTextLength } from '@/lib/user-text';
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AccountFrameView } from '@/components/account/account-frame';
import { ActionBar, Button, Field, Radio, Textarea } from '@/components/ui';
import {
  FEEDBACK_ANSWERS,
  feedbackInputSchema,
  type FeedbackAnswer,
  type FeedbackView,
} from '@/contracts/feedback';
import type { ErrorCode } from '@/lib/errors';
import { submitSessionFeedback } from '@/server/actions/feedback';

export function FeedbackForm({ view }: { view: FeedbackView }) {
  const t = useTranslations('feedback');
  const errors = useTranslations('errors.codes');
  const frame = useTranslations('accountFrame');
  const [happened, setHappened] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<(FeedbackAnswer | null)[]>([null, null, null]);
  const [rating, setRating] = useState<number | null>(null);
  const [answersInvalid, setAnswersInvalid] = useState(false);
  const [ratingInvalid, setRatingInvalid] = useState(false);
  const answerRefs = useRef<(HTMLInputElement | null)[]>([]);
  const firstRating = useRef<HTMLInputElement>(null);
  const answersErrorId = useId();
  const ratingErrorId = useId();
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
      answers: happened ? answers : null,
      rating: happened ? rating : null,
      note: note.trim() || null,
    });
    setHappenedInvalid(false);
    setAnswersInvalid(false);
    setRatingInvalid(false);
    setNoteError(undefined);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === 'happened')) {
        setHappenedInvalid(true);
        firstHappened.current?.focus();
      } else if (parsed.error.issues.some((issue) => issue.path[0] === 'answers')) {
        setAnswersInvalid(true);
        answerRefs.current[answers.findIndex((answer) => answer === null)]?.focus();
      } else if (parsed.error.issues.some((issue) => issue.path[0] === 'rating')) {
        setRatingInvalid(true);
        firstRating.current?.focus();
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
        } else if (result.fieldErrors?.answers) {
          setAnswersInvalid(true);
          answerRefs.current[
            Math.max(
              0,
              answers.findIndex((answer) => answer === null),
            )
          ]?.focus();
        } else if (result.fieldErrors?.rating) {
          setRatingInvalid(true);
          firstRating.current?.focus();
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
            <div className="space-y-6">
              {([0, 1, 2] as const).map((index) => (
                <fieldset key={index}>
                  <legend className="font-semibold">{t(`questions.${view.role}.${index}`)}</legend>
                  <div className="mt-3 grid gap-2">
                    {FEEDBACK_ANSWERS.map((value) => (
                      <label
                        key={value}
                        className="flex min-h-12 items-center gap-3 rounded-control border border-border px-4"
                      >
                        <Radio
                          name={`answer-${index}`}
                          ref={
                            value === 'POSITIVE'
                              ? (element) => {
                                  answerRefs.current[index] = element;
                                }
                              : undefined
                          }
                          required
                          aria-invalid={(answersInvalid && !answers[index]) || undefined}
                          aria-describedby={
                            answersInvalid && !answers[index] ? answersErrorId : undefined
                          }
                          checked={answers[index] === value}
                          onChange={() => {
                            setAnswers((current) =>
                              current.map((item, i) => (i === index ? value : item)),
                            );
                            setAnswersInvalid(false);
                          }}
                        />
                        {t(`answers.${view.role}.${index}.${value}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {answersInvalid && (
                <p id={answersErrorId} role="alert" className="text-danger">
                  {t('questionsRequired')}
                </p>
              )}
              <fieldset>
                <legend className="font-semibold">{t('rating')}</legend>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, index) => {
                    const value = (index + 1) / 2;
                    const label = new Intl.NumberFormat('tr-TR', {
                      maximumFractionDigits: 1,
                    }).format(value);
                    return (
                      <label
                        key={value}
                        className="flex min-h-12 cursor-pointer items-center justify-center gap-1 rounded-control border border-border px-1 has-checked:border-primary has-checked:bg-primary-soft"
                      >
                        <Radio
                          name="rating"
                          ref={index === 0 ? firstRating : undefined}
                          required
                          aria-label={t('ratingOption', { value: label })}
                          aria-invalid={ratingInvalid || undefined}
                          aria-describedby={ratingInvalid ? ratingErrorId : undefined}
                          checked={rating === value}
                          onChange={() => {
                            setRating(value);
                            setRatingInvalid(false);
                          }}
                        />
                        <span aria-hidden="true">{label}</span>
                      </label>
                    );
                  })}
                </div>
                {ratingInvalid && (
                  <p id={ratingErrorId} role="alert" className="mt-2 text-danger">
                    {t('ratingRequired')}
                  </p>
                )}
              </fieldset>
            </div>
          )}
          <Field
            className="[&_.text-sm]:text-base"
            label={t('note')}
            hint={t('optional')}
            error={
              noteError
                ? noteError === 'VALIDATION_INVALID' && userTextLength(note) > 1000
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
          <ActionBar className="bg-bg pb-2 pt-4 lg:mt-auto">
            <Button type="submit" fullWidth size="lg" loading={pending}>
              {pending ? t('sending') : t('submit')}
            </Button>
          </ActionBar>
        </form>
      )}
    </AccountFrameView>
  );
}
