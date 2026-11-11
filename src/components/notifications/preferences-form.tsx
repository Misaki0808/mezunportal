'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  setNotificationPreferencesSchema,
  type NotificationPreferences,
  type SetNotificationPreferencesInput,
} from '@/contracts/notifications';
import type { ActionResult } from '@/contracts/result';
import { Button, PageHeader, Switch } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  initial: NotificationPreferences;
  save: (input: SetNotificationPreferencesInput) => Promise<ActionResult<NotificationPreferences>>;
};
export function NotificationPreferencesForm({ initial, save }: Props) {
  const t = useTranslations('notifications');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [saved, setSaved] = useState(initial.items);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const locked = useRef(false);
  const dirty = items.some((item, index) => item.enabled !== saved[index]?.enabled);
  async function submit() {
    if (locked.current) return;
    const parsed = setNotificationPreferencesSchema.safeParse({
      items: items.map(({ type, enabled }) => ({ type, enabled })),
    });
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(false);
    try {
      const result = await save(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setItems(result.data.items);
      setSaved(result.data.items);
      setSuccess(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 pb-8 pt-10 sm:pt-16">
      <Link
        href="/hesap"
        className="press-row mb-5 inline-flex min-h-11 items-center font-medium text-primary"
      >
        ← {t('back')}
      </Link>
      <PageHeader title={t('title')} description={t('description')} />
      <form
        className="mt-7 flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ul className="divide-y divide-border rounded-card border border-border px-5">
          {items.map((item) => (
            <li key={item.type} className="py-2">
              <Switch
                className="[&_.text-sm]:text-base"
                label={t(`types.${item.type}.label`)}
                description={item.mandatory ? t('mandatory') : t(`types.${item.type}.description`)}
                checked={item.enabled}
                disabled={item.mandatory || pending}
                onChange={(e) => {
                  setSuccess(false);
                  setItems((old) =>
                    old.map((row) =>
                      row.type === item.type ? { ...row, enabled: e.target.checked } : row,
                    ),
                  );
                }}
              />
            </li>
          ))}
        </ul>
        {dirty && <p className="mt-4 text-base text-fg-muted">{t('unsaved')}</p>}
        {success && (
          <p role="status" className="mt-4 text-on-success-soft">
            {t('saved')}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-danger">
            {errors(error)}
          </p>
        )}
        <div className="sticky-actions z-20 mt-auto bg-bg pt-5 pb-2">
          <Button type="submit" fullWidth size="lg" loading={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
