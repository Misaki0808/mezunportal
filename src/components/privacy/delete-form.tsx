'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ACCOUNT_DELETION_EFFECTS,
  DEFAULT_PUBLISHED_CONTENT_CHOICE,
  PUBLISHED_CONTENT_CHOICES,
  deleteAccountSchema,
  type DeleteAccountInput,
} from '@/contracts/privacy';
import { deleteAccount } from '@/server/actions/privacy';
import { Button, Card, Field, Input, Modal, RadioGroup, buttonClasses } from '@/components/ui';
import { usePrivacyForm } from './form-state';

export function DeleteForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations('privacyScreens.delete');
  const common = useTranslations('privacyScreens.common');
  const form = usePrivacyForm();
  const [choice, setChoice] = useState<string>(DEFAULT_PUBLISHED_CONTENT_CHOICE);
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState<DeleteAccountInput | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [emailMismatch, setEmailMismatch] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (confirmed && form.failure?.errorCode === 'ACCOUNT_DELETE_CONFIRMATION_MISMATCH') {
      setConfirmed(null);
      setEmailMismatch(true);
      requestAnimationFrame(() => emailInput.current?.focus());
    }
  }, [confirmed, form.failure?.errorCode]);
  if (deleted)
    return (
      <Card className="mx-auto mt-10 max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold">{t('deleted')}</h1>
        <p role="status">{t('deletedDescription')}</p>
        <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
          {t('home')}
        </Link>
      </Card>
    );
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
      <Link
        href="/hesap"
        className="press-row mb-6 inline-flex min-h-11 items-center font-medium text-primary"
      >
        ← {common('back')}
      </Link>
      <p className="text-sm font-semibold tracking-wider text-primary">{common('eyebrow')}</p>
      <h1 className="mt-3 text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      <Link
        href="/hesap/veriler"
        className="press-row my-5 inline-flex min-h-11 items-center font-medium text-primary"
      >
        {t('download')}
      </Link>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const input = form.parse(deleteAccountSchema, {
            publishedContent: choice,
            confirmEmail: email,
          });
          if (!input) {
            emailInput.current?.focus();
            return;
          }
          if (input.confirmEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase()) {
            setEmailMismatch(true);
            emailInput.current?.focus();
            return;
          }
          setEmailMismatch(false);
          setConfirmed(input);
        }}
      >
        <Card className="space-y-4">
          <RadioGroup
            className="[&_span]:text-base [&_p]:text-base"
            legend={t('choice')}
            name="publishedContent"
            value={choice}
            onValueChange={setChoice}
            options={PUBLISHED_CONTENT_CHOICES.map((value) => ({
              value,
              label: t(value),
              description: t(`${value}Hint`),
            }))}
          />
          <h2 className="font-semibold">{t('consequences')}</h2>
          <ul className="list-disc space-y-2 pl-5">
            {ACCOUNT_DELETION_EFFECTS.common.map((effect) => (
              <li key={effect}>{t(effect)}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <Field
            className="[&_p]:text-base"
            label={t('email')}
            hint={t('emailHint')}
            required
            error={emailMismatch ? t('emailMismatch') : form.fieldError('confirmEmail')}
          >
            {(control) => (
              <Input
                {...control}
                ref={emailInput}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailMismatch(false);
                }}
              />
            )}
          </Field>
        </Card>
        {form.error && !confirmed && !emailMismatch && !form.fieldError('confirmEmail') && (
          <p role="alert" className="text-base text-danger">
            {form.error}
          </p>
        )}
        <Button type="submit" variant="danger" fullWidth>
          {t('button')}
        </Button>
      </form>
      <Modal
        open={!!confirmed}
        onClose={() => {
          if (!form.busy) setConfirmed(null);
        }}
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (!form.busy) setConfirmed(null);
              }}
            >
              {common('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={form.busy}
              onClick={() => {
                if (confirmed)
                  void form.run(
                    () => deleteAccount(confirmed),
                    () => {
                      setDeleted(true);
                      setConfirmed(null);
                    },
                  );
              }}
            >
              {t('button')}
            </Button>
          </>
        }
      >
        {confirmed && (
          <p className="text-base font-medium">
            {t(
              ACCOUNT_DELETION_EFFECTS[
                confirmed.publishedContent ?? DEFAULT_PUBLISHED_CONTENT_CHOICE
              ][0],
            )}
          </p>
        )}
        {form.error && (
          <p role="alert" className="mt-4 text-base text-danger">
            {form.error}
          </p>
        )}
      </Modal>
    </div>
  );
}
