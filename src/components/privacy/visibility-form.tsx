'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FieldVisibilitySettings } from '@/contracts/privacy';
import { VISIBILITY_LEVELS, setFieldVisibilitySchema } from '@/contracts/privacy';
import { setFieldVisibility } from '@/server/actions/privacy';
import { Badge, Button, Card, Field, Select } from '@/components/ui';
import { usePrivacyForm } from './form-state';

export function VisibilityForm({ initial }: { initial: FieldVisibilitySettings }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [partial, setPartial] = useState(false);
  const t = useTranslations('privacyScreens.visibility');
  const fields = useTranslations('privacyScreens.fields');
  const common = useTranslations('privacyScreens.common');
  const form = usePrivacyForm();
  const dirty = settings.fields.some((row, i) => row.level !== saved.fields[i]?.level);
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function beforeLink(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      if (link && !window.confirm(t('unsaved'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeLink, true);
    };
  }, [dirty, t]);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const changes = settings.fields.filter((row, i) => row.level !== saved.fields[i]?.level);
        const inputs = changes.map(({ field, level }) =>
          form.parse(setFieldVisibilitySchema, { field, level }),
        );
        if (inputs.some((input) => !input)) return;
        setPartial(false);
        void form.run(
          async () => {
            let result: Awaited<ReturnType<typeof setFieldVisibility>> | undefined;
            let updated = false;
            for (const input of inputs) {
              if (!input) continue;
              result = await setFieldVisibility(input);
              if (!result.ok) {
                setPartial(updated);
                return result;
              }
              updated = true;
              setSaved(result.data);
            }
            return result ?? { ok: true as const, data: saved };
          },
          (data) => {
            setSaved(data);
            setSettings(data);
          },
          common('saved'),
        );
      }}
    >
      {settings.fields.map((row) => (
        <Card key={row.field}>
          <Field label={fields(row.field)} help={<span className="text-base">{t('help')}</span>}>
            {(control) => (
              <Select
                {...control}
                value={row.level}
                disabled={form.busy}
                onChange={(event) => {
                  const level = event.target.value as typeof row.level;
                  setSettings((current) => ({
                    fields: current.fields.map((field) =>
                      field.field === row.field ? { ...field, level } : field,
                    ),
                  }));
                }}
              >
                {VISIBILITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(level)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {row.isDefault &&
            row.level === saved.fields.find((item) => item.field === row.field)?.level && (
              <Badge>{common('default')}</Badge>
            )}
        </Card>
      ))}
      {form.error && (
        <p role="alert" className="text-base text-danger">
          {form.error}
        </p>
      )}
      {partial && (
        <p role="status" className="text-base text-fg-muted">
          {t('partialSave')}
        </p>
      )}
      {dirty && (
        <p role="status" className="text-base text-fg-muted">
          {t('unsaved')}
        </p>
      )}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-control border border-border bg-bg p-3 shadow-card lg:static">
        <Button type="submit" fullWidth loading={form.busy}>
          {form.busy ? common('saving') : common('save')}
        </Button>
      </div>
    </form>
  );
}
