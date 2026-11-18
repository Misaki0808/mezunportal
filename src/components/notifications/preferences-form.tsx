'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  setNotificationPreferencesSchema,
  type NotificationPreferences,
  type SetNotificationPreferencesInput,
} from '@/contracts/notifications';
import type { ActionResult } from '@/contracts/result';
import { AccountFrameView } from '@/components/account/account-frame';
import { ActionBar, Button, Switch, useAction } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

type Props = {
  initial: NotificationPreferences;
  save: (input: SetNotificationPreferencesInput) => Promise<ActionResult<NotificationPreferences>>;
};
export function NotificationPreferencesForm({ initial, save }: Props) {
  const t = useTranslations('notifications');
  const frame = useTranslations('accountFrame');
  const errors = useTranslations('errors.codes');
  const [items, setItems] = useState(initial.items);
  const [saved, setSaved] = useState(initial.items);
  const action = useAction();
  const pending = action.busy;
  const [error, setError] = useState<ErrorCode>();
  const dirty = items.some((item, index) => item.enabled !== saved[index]?.enabled);
  async function submit() {
    const parsed = setNotificationPreferencesSchema.safeParse({
      items: items.map(({ type, enabled }) => ({ type, enabled })),
    });
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    setError(undefined);
    await action.run(() => save(parsed.data), {
      success: t('saved'),
      onOk: (data) => {
        setItems(data.items);
        setSaved(data.items);
      },
      onFailure: (failure) => setError(failure.errorCode),
    });
  }
  return (
    <AccountFrameView
      eyebrow={frame('eyebrow')}
      backLabel={t('back')}
      title={t('title')}
      description={t('description')}
      width="max-w-2xl"
    >
      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ul className="divide-y divide-border rounded-card border border-border bg-surface px-5 shadow-card">
          {items.map((item) => (
            <li key={item.type} className="py-2">
              <Switch
                className="[&_.text-sm]:text-base"
                label={t(`types.${item.type}.label`)}
                description={item.mandatory ? t('mandatory') : t(`types.${item.type}.description`)}
                checked={item.enabled}
                disabled={item.mandatory || pending}
                onChange={(e) => {
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
        {error && (
          <p role="alert" className="mt-4 text-danger">
            {errors(error)}
          </p>
        )}
        <ActionBar className="bg-bg pt-5 pb-2 lg:mt-auto">
          <Button type="submit" fullWidth size="lg" loading={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </ActionBar>
      </form>
    </AccountFrameView>
  );
}
