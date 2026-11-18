'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BackLink,
  Button,
  Checkbox,
  PageHeader,
  Textarea,
  useAction,
  ActionBar,
} from '@/components/ui';
import { CONTACT_FIELDS, type ContactField } from '@/contracts/privacy';
import { requestSeekerContactSchema, type SeekerContactPreview } from '@/contracts/job-seekers';
import { requestSeekerContact } from '@/server/actions/job-seekers';
import { SeekerCardView } from './card';

export function SeekerContact({
  candidateRef,
  preview,
}: {
  candidateRef: string;
  preview: SeekerContactPreview;
}) {
  const t = useTranslations('seekers');
  const fieldsText = useTranslations('privacyScreens.fields');
  const errors = useTranslations('errors.codes');
  const [fields, setFields] = useState<ContactField[]>([]);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const fieldErrorId = useId();
  const messageErrorId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const action = useAction();
  const pending = action.busy;
  useEffect(() => {
    if (pending) return;
    if (fieldError) firstField.current?.focus();
    else if (messageError) messageField.current?.focus();
  }, [pending, fieldError, messageError]);
  function send() {
    setError('');
    const invalidFields = !requestSeekerContactSchema.shape.fields.safeParse(fields).success;
    const invalidMessage = !requestSeekerContactSchema.shape.message.safeParse(message).success;
    setFieldError(invalidFields);
    setMessageError(invalidMessage);
    if (invalidFields || invalidMessage) {
      (invalidFields ? firstField : messageField).current?.focus();
      return;
    }
    void action.run(() => requestSeekerContact({ ref: candidateRef, fields, message }), {
      success: t('contactSent'),
      onOk: () => setSent(true),
      onFailure: (failure) => {
        if (failure.fieldErrors?.fields) {
          setFieldError(true);
          firstField.current?.focus();
        } else if (failure.fieldErrors?.message) {
          setMessageError(true);
          messageField.current?.focus();
        } else setError(errors(failure.errorCode));
      },
    });
  }
  return (
    <div className="w-full min-w-0 max-w-2xl space-y-6">
      <BackLink href="/adaylar" flush>
        {t('backSearch')}
      </BackLink>
      <PageHeader title={t('contactTitle')} description={t('contactDescription')} />
      {sent ? (
        <div className="space-y-4 rounded-card border border-border bg-surface p-5 shadow-card">
          <p>{t('contactSent')}</p>
          <Link
            href="/hesap/iletisim?box=OUTGOING"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline"
          >
            {t('requests')}
          </Link>
        </div>
      ) : !preview.canRequest ? (
        <p className="rounded-card border border-border bg-surface p-5 text-fg-muted shadow-card">
          {t('contactUnavailable')}
        </p>
      ) : (
        <>
          <SeekerCardView card={preview.card} />
          <fieldset
            className="rounded-card border border-border bg-surface p-5 shadow-card"
            aria-invalid={fieldError || undefined}
            aria-describedby={fieldError ? fieldErrorId : undefined}
          >
            <legend className="font-semibold">{t('fields')}</legend>
            <p className="mb-3 text-fg-muted">{t('fieldsHint')}</p>
            {CONTACT_FIELDS.map((field) => (
              <Checkbox
                key={field}
                ref={
                  field === CONTACT_FIELDS.find((item) => preview.requestableFields.includes(item))
                    ? firstField
                    : undefined
                }
                aria-invalid={
                  fieldError &&
                  field === CONTACT_FIELDS.find((item) => preview.requestableFields.includes(item))
                    ? true
                    : undefined
                }
                aria-describedby={
                  fieldError &&
                  field === CONTACT_FIELDS.find((item) => preview.requestableFields.includes(item))
                    ? fieldErrorId
                    : undefined
                }
                label={fieldsText(field)}
                disabled={!preview.requestableFields.includes(field) || pending}
                checked={fields.includes(field)}
                onChange={(e) => {
                  setFieldError(false);
                  setFields((old) =>
                    e.target.checked ? [...old, field] : old.filter((x) => x !== field),
                  );
                }}
              />
            ))}
            {fieldError && (
              <p id={fieldErrorId} role="alert" className="text-danger">
                {t('selectField')}
              </p>
            )}
          </fieldset>
          <label className="block space-y-2">
            <span className="font-semibold">{t('message')}</span>
            <Textarea
              ref={messageField}
              aria-invalid={messageError || undefined}
              aria-describedby={messageError ? messageErrorId : undefined}
              rows={4}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setMessageError(false);
              }}
            />
            {messageError && (
              <span id={messageErrorId} role="alert" className="text-danger">
                {message.trim().length > 500 ? t('messageTooLong') : errors('VALIDATION_INVALID')}
              </span>
            )}
          </label>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <ActionBar className="bg-bg py-3">
            <Button className="w-full" loading={pending} onClick={send}>
              {t('send')}
            </Button>
          </ActionBar>
        </>
      )}
    </div>
  );
}
