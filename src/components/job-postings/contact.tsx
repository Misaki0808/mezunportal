'use client';
import Link from 'next/link';
import { useHydrated } from '@/hooks/use-hydrated';
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CONTACT_FIELDS, type ContactField } from '@/contracts/privacy';
import { CONTACT_MESSAGE_MAX, type SendContactRequestOutput } from '@/contracts/contact-request';
import { requestJobPostingContactSchema } from '@/contracts/job-postings';
import type { ActionResult } from '@/contracts/result';
import { Button, Checkbox, Field, Textarea, buttonClasses, useAction } from '@/components/ui';

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
  const labels = useTranslations('privacyScreens.fields');
  const errors = useTranslations('errors.codes');
  const [fields, setFields] = useState<ContactField[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldInvalid, setFieldInvalid] = useState(false);
  const [messageError, setMessageError] = useState('');
  const fieldErrorId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const firstAvailable = CONTACT_FIELDS.find((field) => requestableFields.includes(field));
  const [sent, setSent] = useState(false);
  const action = useAction();
  const pending = action.busy;
  if (sent)
    return (
      <div className="space-y-5 rounded-card border border-border bg-surface p-5">
        <p>{t('sent')}</p>
        <Link href="/hesap/iletisim?box=OUTGOING" className={buttonClasses({ fullWidth: true })}>
          {t('sendDone')}
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
        setFieldInvalid(false);
        setMessageError('');
        const input = { jobPostingId: postingId, fields, message };
        const parsed = requestJobPostingContactSchema.safeParse(input);
        if (!parsed.success) {
          const invalidFields = parsed.error.issues.some((issue) => issue.path[0] === 'fields');
          const invalidMessage = parsed.error.issues.some((issue) => issue.path[0] === 'message');
          if (invalidFields) {
            setFieldInvalid(true);
            firstField.current?.focus();
          } else if (invalidMessage) {
            setMessageError(errors('VALIDATION_INVALID'));
            messageField.current?.focus();
          } else setError(errors('VALIDATION_INVALID'));
          return;
        }
        void action.run(() => send(input), {
          success: t('sentToast'),
          onOk: () => setSent(true),
          onFailure: (failure) => {
            if (failure.fieldErrors?.fields) {
              setFieldInvalid(true);
              firstField.current?.focus();
            } else if (failure.fieldErrors?.message) {
              setMessageError(errors(failure.fieldErrors.message));
              messageField.current?.focus();
            } else setError(errors(failure.errorCode));
          },
        });
      }}
    >
      <fieldset className="space-y-3 rounded-card border border-border bg-surface p-5">
        <legend className="font-semibold">{t('fieldLegend')}</legend>
        <p className="text-fg-muted">{t('requestableHelp')}</p>
        {CONTACT_FIELDS.map((field) => (
          <div key={field}>
            <Checkbox
              label={labels(field)}
              ref={field === firstAvailable ? firstField : undefined}
              checked={fields.includes(field)}
              disabled={pending || !requestableFields.includes(field)}
              aria-invalid={fieldInvalid && requestableFields.includes(field) ? true : undefined}
              aria-describedby={
                [
                  !requestableFields.includes(field) ? `${field}-unavailable` : undefined,
                  fieldInvalid && requestableFields.includes(field) ? fieldErrorId : undefined,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onChange={(event) => {
                setFieldInvalid(false);
                setFields((old) =>
                  event.target.checked ? [...old, field] : old.filter((x) => x !== field),
                );
              }}
            />
            {!requestableFields.includes(field) && (
              <p id={`${field}-unavailable`} className="pl-9 text-sm text-fg-muted">
                {t('fieldUnavailable')}
              </p>
            )}
          </div>
        ))}
        {fieldInvalid && (
          <p id={fieldErrorId} role="alert" className="text-danger">
            {t('fieldError')}
          </p>
        )}
      </fieldset>
      <div className="rounded-card border border-border bg-surface p-5">
        <Field
          label={t('message')}
          hint={t('messageHelp', { max: CONTACT_MESSAGE_MAX })}
          error={messageError || undefined}
        >
          {(props) => (
            <Textarea
              {...props}
              ref={messageField}
              rows={4}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setMessageError('');
              }}
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
