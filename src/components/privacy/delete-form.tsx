'use client';
import { useState } from 'react';
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

export function DeleteForm() {
  const t = useTranslations('privacyScreens.delete');
  const common = useTranslations('privacyScreens.common');
  const form = usePrivacyForm();
  const [choice, setChoice] = useState<string>(DEFAULT_PUBLISHED_CONTENT_CHOICE);
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState<DeleteAccountInput | null>(null);
  const [deleted, setDeleted] = useState(false);
  if (deleted)
    return (
      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">{t('deleted')}</h2>
        <p role="status">{t('deletedDescription')}</p>
        <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
          {t('home')}
        </Link>
      </Card>
    );
  return (
    <>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const input = form.parse(deleteAccountSchema, {
            publishedContent: choice,
            confirmEmail: email,
          });
          if (input) setConfirmed(input);
        }}
      >
        <Card className="space-y-4">
          <RadioGroup
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
            label={t('email')}
            hint={t('emailHint')}
            required
            error={form.fieldError('confirmEmail')}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
        </Card>
        {form.error && (
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
    </>
  );
}
