'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, PageHeader, Textarea, useAction } from '@/components/ui';
import { CONTACT_FIELDS, type ContactField } from '@/contracts/privacy';
import type { SeekerContactPreview } from '@/contracts/job-seekers';
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
  const action = useAction();
  const pending = action.busy;
  function send() {
    setError('');
    if (!fields.length) {
      setError(t('selectField'));
      return;
    }
    void action.run(() => requestSeekerContact({ ref: candidateRef, fields, message }), {
      success: t('contactSent'),
      onOk: () => setSent(true),
      onFailure: (failure) => setError(errors(failure.errorCode)),
    });
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10 pb-32">
      <Link
        href="/adaylar"
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
      >
        ← {t('backSearch')}
      </Link>
      <PageHeader title={t('contactTitle')} description={t('contactDescription')} />
      {sent ? (
        <div className="space-y-4 rounded-card border border-border p-5">
          <p>{t('contactSent')}</p>
          <Link
            href="/hesap/iletisim?box=OUTGOING"
            className="inline-flex min-h-11 items-center font-semibold text-primary underline"
          >
            {t('requests')}
          </Link>
        </div>
      ) : !preview.canRequest ? (
        <p className="rounded-card border border-border p-5 text-fg-muted">
          {t('contactUnavailable')}
        </p>
      ) : (
        <>
          <SeekerCardView card={preview.card} />
          <fieldset className="rounded-card border border-border p-5">
            <legend className="font-semibold">{t('fields')}</legend>
            <p className="mb-3 text-fg-muted">{t('fieldsHint')}</p>
            {CONTACT_FIELDS.map((field) => (
              <label key={field} className="flex min-h-11 items-center gap-3">
                <input
                  className="size-5 accent-primary"
                  type="checkbox"
                  disabled={!preview.requestableFields.includes(field) || pending}
                  checked={fields.includes(field)}
                  onChange={(e) =>
                    setFields((old) =>
                      e.target.checked ? [...old, field] : old.filter((x) => x !== field),
                    )
                  }
                />
                {fieldsText(field)}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-2">
            <span className="font-semibold">{t('message')}</span>
            <Textarea
              maxLength={500}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="sticky bottom-20 bg-bg py-3 lg:static">
            <Button className="w-full" loading={pending} onClick={send}>
              {t('send')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
