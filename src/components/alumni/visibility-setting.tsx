'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionResult } from '@/contracts/result';
import type { AlumniVisibilityInput } from '@/contracts/alumni-directory';
import { Checkbox } from '@/components/ui';
import { useHydrated } from '@/hooks/use-hydrated';

type Value = { visible: boolean; eligible: boolean };
export function AlumniVisibilitySetting({
  initial,
  save,
  onBusyChange,
}: {
  initial: Value;
  save: (value: AlumniVisibilityInput) => Promise<ActionResult<Value>>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations('alumniDirectory');
  const hydrated = useHydrated();
  const errors = useTranslations('errors.codes');
  const [value, setValue] = useState(initial.visible);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState(false);
  const locked = useRef(false);
  if (!initial.eligible) return null;
  async function change(next: boolean) {
    if (locked.current) return;
    locked.current = true;
    const previous = value;
    setValue(next);
    setPending(true);
    onBusyChange?.(true);
    setError(undefined);
    setStatus(false);
    try {
      const result = await save({ visible: next });
      if (result.ok) {
        setValue(result.data.visible);
        setStatus(true);
      } else {
        setValue(previous);
        setError(errors(result.errorCode));
      }
    } catch {
      setValue(previous);
      setError(errors('SERVER_UNEXPECTED'));
    } finally {
      setPending(false);
      locked.current = false;
      onBusyChange?.(false);
    }
  }
  return (
    <section
      data-hydrated={hydrated ? 'true' : undefined}
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 className="font-bold">{t('visibilityTitle')}</h2>
      <p className="mt-2 text-sm text-fg-muted">{t('visibilityDescription')}</p>
      <div className="mt-3">
        <Checkbox
          label={t('visibilityLabel')}
          description={t('autoSave')}
          checked={value}
          disabled={pending || !hydrated}
          onChange={(event) => void change(event.target.checked)}
        />
      </div>
      {pending && (
        <p role="status" className="mt-2 text-sm">
          {t('saving')}
        </p>
      )}
      {status && !pending && (
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
