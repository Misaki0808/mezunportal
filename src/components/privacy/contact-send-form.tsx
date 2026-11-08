'use client';
import { useState } from 'react';
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
}: {
  targetUserId: string;
  requestableFields: ContactField[];
}) {
  const t = useTranslations('privacyScreens.contacts');
  const common = useTranslations('privacyScreens.common');
  const labels = useTranslations('privacyScreens.fields');
  const form = usePrivacyForm();
  const [fields, setFields] = useState<ContactField[]>([]);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <Card className="space-y-5">
        <p role="status" className="text-base">
          {t('sent')}
        </p>
        <Link href="/hesap/iletisim?box=OUTGOING" className={buttonClasses({ fullWidth: true })}>
          {t('sendDone')}
        </Link>
      </Card>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const input = form.parse(sendContactRequestSchema, { targetUserId, fields, message });
        if (input)
          void form.run(
            () => sendContactRequest(input),
            () => setSent(true),
          );
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
                checked={fields.includes(field)}
                disabled={form.busy || !requestableFields.includes(field)}
                aria-describedby={
                  !requestableFields.includes(field) ? `${field}-unavailable` : undefined
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
            <p role="alert" className="mt-2 text-base text-danger">
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
