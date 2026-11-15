'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionResult } from '@/contracts/result';
import type { AlumniVisibilityInput } from '@/contracts/alumni-directory';
import { Button, Checkbox } from '@/components/ui';

type Value = { visible: boolean; eligible: boolean };
export function AlumniVisibilitySetting({
  initial,
  save,
}: {
  initial: Value;
  save: (value: AlumniVisibilityInput) => Promise<ActionResult<Value>>;
}) {
  const t = useTranslations('alumniDirectory');
  const errors = useTranslations('errors.codes');
  const [value, setValue] = useState(initial.visible);
  const [saved, setSaved] = useState(initial.visible);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  if (!initial.eligible) return null;
  async function submit() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setSuccess(false);
    try {
      const result = await save({ visible: value });
      if (result.ok) {
        setSaved(result.data.visible);
        setSuccess(true);
      } else setError(errors(result.errorCode));
    } catch {
      setError(errors('SERVER_UNEXPECTED'));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="font-bold">{t('visibilityTitle')}</h2>
      <p className="mt-2 text-sm text-fg-muted">{t('visibilityDescription')}</p>
      <div className="mt-3">
        <Checkbox
          label={t('visibilityLabel')}
          checked={value}
          onChange={(event) => {
            setValue(event.target.checked);
            setSuccess(false);
          }}
        />
      </div>
      <Button
        className="mt-3"
        onClick={submit}
        loading={pending}
        {...(pending || value === saved
          ? { disabled: true as const, disabledReason: t('unchanged') }
          : { disabled: false as const })}
      >
        {t('save')}
      </Button>
      {success && (
        <p role="status" className="mt-2 text-sm">
          {t('saved')}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
