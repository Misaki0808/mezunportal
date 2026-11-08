'use client';
import Link from 'next/link';
import { useHydrated } from '@/hooks/use-hydrated';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CONTACT_FIELDS, type ContactField } from '@/contracts/privacy';
import { CONTACT_MESSAGE_MAX, type SendContactRequestOutput } from '@/contracts/contact-request';
import type { ActionResult } from '@/contracts/result';
import { Button, Checkbox, Field, Textarea, buttonClasses } from '@/components/ui';

/** Yazar kimliği tarayıcıya gönderilmez; sunucu eylemi hedefi ilan kimliğiyle çözer. */
export function PostingContactForm({
  postingId,
  requestableFields,
  send,
}: {
  postingId: string;
  requestableFields: ContactField[];
  send: (input: {
    jobPostingId: string;
    fields: ContactField[];
    message: string;
  }) => Promise<ActionResult<SendContactRequestOutput>>;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('privacyScreens.contacts');
  const jobs = useTranslations('jobs');
  const labels = useTranslations('privacyScreens.fields');
  const errors = useTranslations('errors.codes');
  const [fields, setFields] = useState<ContactField[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent)
    return (
      <div className="space-y-5 rounded-3xl border border-border bg-surface p-5">
        <p role="status">{jobs('contactSent')}</p>
        <Link href="/ilanlar" className={buttonClasses({ fullWidth: true })}>
          {jobs('back')}
        </Link>
      </div>
    );
  return (
    <form
      data-hydrated={hydrated ? 'true' : undefined}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        if (!fields.length) {
          setError(t('fieldError'));
          return;
        }
        start(async () => {
          const result = await send({ jobPostingId: postingId, fields, message });
          if (!result.ok) {
            setError(errors(result.errorCode));
            return;
          }
          setSent(true);
        });
      }}
    >
      <fieldset className="space-y-3 rounded-3xl border border-border bg-surface p-5">
        <legend className="font-semibold">{t('fieldLegend')}</legend>
        <p className="text-fg-muted">{t('requestableHelp')}</p>
        {CONTACT_FIELDS.map((field) => (
          <div key={field}>
            <Checkbox
              label={labels(field)}
              checked={fields.includes(field)}
              disabled={pending || !requestableFields.includes(field)}
              aria-describedby={
                !requestableFields.includes(field) ? `${field}-unavailable` : undefined
              }
              onChange={(event) =>
                setFields((old) =>
                  event.target.checked ? [...old, field] : old.filter((x) => x !== field),
                )
              }
            />
            {!requestableFields.includes(field) && (
              <p id={`${field}-unavailable`} className="pl-9 text-sm text-fg-muted">
                {t('fieldUnavailable')}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      <div className="rounded-3xl border border-border bg-surface p-5">
        <Field label={t('message')} hint={t('messageHelp', { max: CONTACT_MESSAGE_MAX })}>
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              maxLength={CONTACT_MESSAGE_MAX}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('notePlaceholder')}
            />
          )}
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={pending} fullWidth>
        {t('send')}
      </Button>
    </form>
  );
}
