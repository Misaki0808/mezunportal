'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AccountFrameView } from '@/components/account/account-frame';
import { ActionBar, Button, Field, Radio, Textarea } from '@/components/ui';
import type { FeedbackView } from '@/contracts/feedback';
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
