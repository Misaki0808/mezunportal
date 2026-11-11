'use client';
import { useHydrated } from '@/hooks/use-hydrated';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  requestSignInLinkSchema,
  type CheckEmailResponse,
  type RequestSignInLinkInput,
  type SignInOptions,
  type StartLinkedInSignInOutput,
} from '@/contracts/auth';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Input } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  options: SignInOptions;
  callbackError?: ErrorCode;
  returnTo?: string;
  requestLink: (input: RequestSignInLinkInput) => Promise<ActionResult<CheckEmailResponse>>;
  startLinkedIn: () => Promise<ActionResult<StartLinkedInSignInOutput>>;
};

export function SignInForm({
  options,
  callbackError,
  returnTo,
  requestLink,
  startLinkedIn,
}: Props) {
  const hydrated = useHydrated();
  const t = useTranslations('authScreens.signIn');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const locked = useRef(false);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<ErrorCode>();
  const [error, setError] = useState<ErrorCode | undefined>(callbackError);
  const [pending, setPending] = useState<'email' | 'linkedin'>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setError(undefined);
    setFieldError(undefined);
    const parsed = requestSignInLinkSchema.safeParse({ email, ...(returnTo ? { returnTo } : {}) });
    if (!parsed.success) {
      setFieldError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setPending('email');
    try {
      const result = await requestLink(parsed.data);
      if (result.ok) router.push('/giris/epostani-kontrol-et');
      else if (result.fieldErrors?.email) setFieldError(result.fieldErrors.email);
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  async function handleLinkedIn() {
    if (locked.current || !options.linkedin.enabled) return;
    locked.current = true;
    setPending('linkedin');
    setError(undefined);
    try {
      const result = await startLinkedIn();
      if (result.ok) window.location.assign(result.data.redirectUrl);
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4">
        {options.linkedin.enabled && (
          <>
            <Button
              variant="secondary"
              fullWidth
              loading={pending === 'linkedin'}
              onClick={handleLinkedIn}
              leadingIcon={
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 9h4v12H3V9Zm6 0h4v1.6c.6-1 1.7-1.9 3.7-1.9 3.7 0 4.3 2.4 4.3 5.5V21h-4v-6c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H9V9Z" />
                </svg>
              }
            >
              {pending === 'linkedin' ? t('redirecting') : t('linkedin')}
            </Button>
            <div className="flex items-center gap-3 text-base text-fg-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              {t('divider')}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
      </div>
      <form
        data-hydrated={hydrated ? 'true' : undefined}
        noValidate
        onSubmit={handleSubmit}
        className="mt-4 flex flex-1 flex-col gap-6"
      >
        <Field
          className="[&_p]:text-base"
          label={t('email')}
          hint={t('emailHint')}
          error={
            fieldError
              ? fieldError === 'VALIDATION_INVALID'
                ? t('invalidEmail')
                : errors(fieldError)
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
        {error && (
          <p role="alert" className="text-base text-danger">
            {errors(error)}
          </p>
        )}
        <div className="mt-auto pt-8 pb-[env(safe-area-inset-bottom)]">
          <Button type="submit" fullWidth size="lg" loading={pending === 'email'}>
            {pending === 'email' ? t('sending') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
