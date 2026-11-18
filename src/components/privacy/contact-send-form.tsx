'use client';
import { useHydrated } from '@/hooks/use-hydrated';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CONTACT_FIELDS, type ContactField } from '@/contracts/privacy';
import { CONTACT_MESSAGE_MAX, sendContactRequestSchema } from '@/contracts/contact-request';
import { sendContactRequest } from '@/server/actions/contact-request';
import { Button, Card, Checkbox, Field, Textarea, buttonClasses } from '@/components/ui';
import { usePrivacyForm } from './form-state';

export function ContactSendForm({
  targetUserId,
  requestableFields,
  pendingRequest = false,
}: {
  targetUserId: string;
  requestableFields: ContactField[];
  pendingRequest?: boolean;
}) {
  const hydrated = useHydrated();
  const t = useTranslations('privacyScreens.contacts');
  const common = useTranslations('privacyScreens.common');
  const labels = useTranslations('privacyScreens.fields');
  const form = usePrivacyForm();
  const [fields, setFields] = useState<ContactField[]>([]);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const sentRef = useRef<HTMLParagraphElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const fieldErrorId = useId();
  const firstAvailable = CONTACT_FIELDS.find((field) => requestableFields.includes(field));
  // Form kalkıp yerine sonuç gelir; odak formdaki düğmede kalamaz, sonuca taşınır.
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);
  if (pendingRequest)
    return (
      <Card className="space-y-5">
        <p id="contact-pending" role="status">
          {t('pendingRequest')}
        </p>
        <Button fullWidth disabled disabledReasonId="contact-pending">
          {t('send')}
        </Button>
        <Link href="/hesap/iletisim?box=OUTGOING" className={buttonClasses({ fullWidth: true })}>
          {t('sendDone')}
        </Link>
      </Card>
    );
  if (sent)
    return (
      <Card className="space-y-5">
        <p ref={sentRef} tabIndex={-1} className="text-base">
          {t('sent')}
        </p>
        <Link href="/hesap/iletisim?box=OUTGOING" className={buttonClasses({ fullWidth: true })}>
          {t('sendDone')}
        </Link>
      </Card>
    );
  return (
    <form
      data-hydrated={hydrated ? 'true' : undefined}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const candidate = { targetUserId, fields, message };
        const input = form.parse(sendContactRequestSchema, candidate);
        if (input)
          void form.run(
            () => sendContactRequest(input),
            () => setSent(true),
            t('sentToast'),
            (failure) => {
              if (failure.fieldErrors?.fields) firstField.current?.focus();
              else if (failure.fieldErrors?.message) messageField.current?.focus();
            },
          );
        else {
          const parsed = sendContactRequestSchema.safeParse(candidate);
          if (!parsed.success) {
            if (parsed.error.issues.some((issue) => issue.path[0] === 'fields'))
              firstField.current?.focus();
            else if (parsed.error.issues.some((issue) => issue.path[0] === 'message'))
              messageField.current?.focus();
          }
        }
      }}
    >
      <Card>
        <fieldset>
          <p className="mb-3 text-base text-fg-muted">{t('requestableHelp')}</p>
          <legend className="mb-3 text-lg font-semibold">{t('fieldLegend')}</legend>
          {CONTACT_FIELDS.map((field) => (
            <div key={field}>
              <Checkbox
                label={labels(field)}
                ref={field === firstAvailable ? firstField : undefined}
                checked={fields.includes(field)}
                disabled={form.busy || !requestableFields.includes(field)}
                aria-invalid={
                  form.fieldError('fields') && requestableFields.includes(field) ? true : undefined
                }
                aria-describedby={
                  [
                    !requestableFields.includes(field) ? `${field}-unavailable` : undefined,
                    form.fieldError('fields') && requestableFields.includes(field)
                      ? fieldErrorId
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onChange={(e) =>
                  setFields(
                    e.target.checked ? [...fields, field] : fields.filter((f) => f !== field),
                  )
                }
              />
              {!requestableFields.includes(field) && (
                <p id={`${field}-unavailable`} className="pl-9 text-base text-fg-muted">
                  {t('fieldUnavailable')}
                </p>
              )}
            </div>
          ))}
          {form.fieldError('fields') && (
            <p id={fieldErrorId} role="alert" className="mt-2 text-base text-danger">
              {t('fieldError')}
            </p>
          )}
        </fieldset>
      </Card>
      <Card>
        <Field
          className="[&_p]:text-base"
          label={t('message')}
          hint={t('messageHelp', { max: CONTACT_MESSAGE_MAX })}
          error={form.fieldError('message')}
        >
          {(control) => (
            <Textarea
              {...control}
              ref={messageField}
              rows={4}
              maxLength={CONTACT_MESSAGE_MAX}
              value={message}
              disabled={form.busy}
              placeholder={t('notePlaceholder')}
              onChange={(e) => setMessage(e.target.value)}
            />
          )}
        </Field>
      </Card>
      {form.error && (
        <p role="alert" className="text-base text-danger">
          {form.error}
        </p>
      )}
      <Button type="submit" fullWidth loading={form.busy}>
        {form.busy ? common('saving') : t('send')}
      </Button>
    </form>
  );
}
