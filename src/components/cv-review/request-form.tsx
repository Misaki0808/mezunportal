'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, Field, Textarea } from '@/components/ui';
import {
  createCvReviewRequestSchema,
  type CvReviewAvailability,
} from '@/contracts/cv-review-request';
import { createCvReviewRequest } from '@/server/actions/cv-review-request';
export function RequestForm({
  mentorId,
  availability,
  embedded = false,
}: {
  mentorId: string;
  availability: CvReviewAvailability;
  embedded?: boolean;
}) {
  const t = useTranslations('cvReview'),
    errors = useTranslations('errors.codes');
  const [note, setNote] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false),
    [invalid, setInvalid] = useState(false);
  const lock = useRef(false);
  async function submit() {
    const p = createCvReviewRequestSchema.safeParse({ mentorId, note });
    if (!p.success) {
      setInvalid(true);
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError('');
    try {
      const result = await createCvReviewRequest(p.data);
      if (result.ok) setSuccess(true);
      else setError(errors(result.errorCode));
    } catch {
      setError(errors('SERVER_UNEXPECTED'));
    } finally {
      setPending(false);
      lock.current = false;
    }
  }
  return (
    <div
      className={
        embedded ? 'pb-[env(safe-area-inset-bottom)]' : 'mx-auto max-w-2xl px-5 py-10 pb-28'
      }
    >
      {!embedded && (
        <Link
          className="inline-flex min-h-11 items-center text-primary"
          href={`/uye/${encodeURIComponent(mentorId)}`}
        >
          ← {t('backProfile')}
        </Link>
      )}
      {!embedded && <h1 className="mt-3 text-3xl font-semibold">{t('requestTitle')}</h1>}
      <p className="mt-3 text-base text-fg-muted">{t('requestDescription')}</p>
      {success ? (
        <div role="status" className="mt-8">
          <p>{t('sent')}</p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center text-primary"
            href="/hesap/cv-inceleme"
          >
            {t('toInbox')} →
          </Link>
        </div>
      ) : availability.available ? (
        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label={t('note')} hint={t('noteHint')} error={invalid ? t('required') : undefined}>
            {(control) => (
              <Textarea
                {...control}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setInvalid(false);
                }}
                maxLength={500}
                rows={5}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={pending}>
            {pending ? t('sending') : t('send')}
          </Button>
        </form>
      ) : (
        <div className="mt-8">
          <p role="status">{t(`unavailable.${availability.reason ?? 'NOT_MENTOR'}`)}</p>
          {availability.reason === 'NO_CV' && (
            <Link className="mt-3 inline-flex min-h-11 items-center text-primary" href="/profil/cv">
              {t('toCv')} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
