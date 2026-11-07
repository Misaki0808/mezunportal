'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FieldVisibilitySettings } from '@/contracts/privacy';
import { VISIBILITY_LEVELS, setFieldVisibilitySchema } from '@/contracts/privacy';
import { setFieldVisibility } from '@/server/actions/privacy';
import { Badge, Button, Card, Field, Select } from '@/components/ui';
import { usePrivacyForm } from './form-state';

export function VisibilityForm({ initial }: { initial: FieldVisibilitySettings }) {
  const [settings, setSettings] = useState(initial);
  const t = useTranslations('privacyScreens.visibility');
  const fields = useTranslations('privacyScreens.fields');
  const common = useTranslations('privacyScreens.common');
  const form = usePrivacyForm();
  return (
    <div className="space-y-4">
      {settings.fields.map((row) => (
        <Card key={row.field}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              const input = form.parse(setFieldVisibilitySchema, {
                field: row.field,
                level: values.get('level'),
              });
              if (input)
                void form.run(
                  () => setFieldVisibility(input),
                  setSettings,
                  t('updated', { field: fields(row.field) }),
                );
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Field
                  label={fields(row.field)}
                  help={<span className="text-base">{t('help')}</span>}
                >
                  {(control) => (
                    <Select
                      {...control}
                      name="level"
                      defaultValue={row.level}
                      key={row.level}
                      disabled={form.busy}
                    >
                      {VISIBILITY_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {t(level)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {row.isDefault ? <Badge>{common('default')}</Badge> : <span />}
              <Button type="submit" variant="secondary" loading={form.busy}>
                {common('save')}
              </Button>
            </div>
          </form>
        </Card>
      ))}
      {form.error && (
        <p role="alert" className="text-base text-danger">
          {form.error}
        </p>
      )}
    </div>
  );
}
