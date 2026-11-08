'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  requestEmailChangeSchema,
  type CheckEmailResponse,
  type RequestEmailChangeInput,
} from '@/contracts/auth';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Input } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  submit: (input: RequestEmailChangeInput) => Promise<ActionResult<CheckEmailResponse>>;
};

export function EmailChangeForm({ submit }: Props) {
  const t = useTranslations('authScreens.emailChange');
  const errors = useTranslations('errors.codes');
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<ErrorCode>();
  const [formError, setFormError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const locked = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setFieldError(undefined);
    setFormError(undefined);
    const parsed = requestEmailChangeSchema.safeParse({ newEmail: email });
    if (!parsed.success) {
      setFieldError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setPending(true);
    try {
      const result = await submit(parsed.data);
      if (result.ok) setComplete(true);
      else {
        setFieldError(result.fieldErrors?.newEmail);
        setFormError(result.fieldErrors?.newEmail ? undefined : result.errorCode);
      }
    } catch {
      setFormError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  if (complete) {
    return (
      <div role="status" className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold text-fg">{t('successTitle')}</h2>
        <p className="mt-2 text-base text-fg-muted">{t('success')}</p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6">
      <Field
        className="[&_p]:text-base"
        label={t('label')}
        error={
          fieldError === 'VALIDATION_INVALID'
            ? t('invalidEmail')
            : fieldError
              ? errors(fieldError)
              : undefined
        }
        required
      >
        {(control) => (
          <Input
            {...control}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </Field>
      {formError && (
        <p role="alert" className="text-base text-danger">
          {errors(formError)}
        </p>
      )}
      <div className="mt-auto pb-[env(safe-area-inset-bottom)]">
        <Button type="submit" fullWidth size="lg" loading={pending}>
          {pending ? t('sending') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
