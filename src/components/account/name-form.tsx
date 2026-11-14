'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';

import {
  ACCOUNT_NAME_LIMITS,
  isValidAccountName,
  normalizeAccountName,
  updateMyNameSchema,
  type UpdateMyNameInput,
  type UpdateMyNameOutput,
} from '@/contracts/account-name';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Input, useAction } from '@/components/ui';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Ad soyad formu (kart 353). `settings`: hesap ayarı sayfasında; `onboarding`: ilk girişte türetilmiş adı onaylama/düzeltme
 * kartı. Kural sunucudadır; burada aynı şema yalnız anında geri bildirim içindir. Başarıda toast, hatada alanın altında
 * kararlı metin; girilen değer hatada silinmez.
 */
export function NameForm({
  initialName,
  update,
  variant = 'settings',
}: {
  initialName: string;
  update: (input: UpdateMyNameInput) => Promise<ActionResult<UpdateMyNameOutput>>;
  variant?: 'settings' | 'onboarding';
}) {
  const hydrated = useHydrated();
  const t = useTranslations('accountName');
  const errors = useTranslations('errors.codes');
  const action = useAction();
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  // E-postadan türetilen ad çoğu zaman geçersizdir ("ayse yilmaz1989"); kullanıcı bunu baştan görür.
  const derivedLooksWrong = variant === 'onboarding' && !isValidAccountName(initialName);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = updateMyNameSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldError(errors('ACCOUNT_NAME_INVALID'));
      input.current?.focus();
      return;
    }
    setFieldError(undefined);
    void action.run(() => update(parsed.data), {
      success: (data) => (data.changed ? t('saved') : t('unchanged')),
      onOk: (data) => setName(data.name),
      onFailure: (failure) => {
        const code = failure.fieldErrors?.name;
        if (code) {
          setFieldError(errors(code));
          input.current?.focus();
        }
      },
    });
  }

  const form = (
    <form
      noValidate
      data-hydrated={hydrated ? 'true' : undefined}
      onSubmit={submit}
      className="flex flex-col gap-4"
    >
      <Field
        label={t('label')}
        hint={
          derivedLooksWrong
            ? t('derivedHint')
            : variant === 'onboarding'
              ? t('onboardingHint')
              : t('hint')
        }
        error={fieldError}
      >
        {(control) => (
          <Input
            {...control}
            ref={input}
            value={name}
            autoComplete="name"
            maxLength={ACCOUNT_NAME_LIMITS.max}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(undefined);
            }}
            onBlur={() => setName(normalizeAccountName(name))}
          />
        )}
      </Field>
      {action.error && !fieldError && (
        <p role="alert" className="text-base text-danger">
          {action.error}
        </p>
      )}
      <Button type="submit" size="lg" fullWidth loading={action.busy}>
        {action.busy ? t('saving') : t('save')}
      </Button>
    </form>
  );

  if (variant === 'settings') return form;
  return (
    <section
      aria-labelledby="account-name-title"
      className="mt-6 rounded-card border border-border bg-surface p-5"
    >
      <h2 id="account-name-title" className="mb-4 text-lg font-semibold text-fg">
        {t('onboardingTitle')}
      </h2>
      {form}
    </section>
  );
}
