'use client';
import { useTranslations } from 'next-intl';
import { useHydrated } from '@/hooks/use-hydrated';
import { DATA_EXPORT_HREF, dataExportSchema } from '@/contracts/privacy';
import { isErrorCode } from '@/lib/errors';
import { Button } from '@/components/ui';
import { usePrivacyForm } from './form-state';

export function ExportButton() {
  const hydrated = useHydrated();
  const t = useTranslations('privacyScreens.export');
  const form = usePrivacyForm();
  return (
    <div data-hydrated={hydrated ? 'true' : undefined} className="space-y-3">
      <Button
        fullWidth
        loading={form.busy}
        onClick={() => {
          void form.run(
            async () => {
              const response = await fetch(DATA_EXPORT_HREF, { cache: 'no-store' });
              const data: unknown = await response.json();
              if (!response.ok) {
                const code =
                  data &&
                  typeof data === 'object' &&
                  'errorCode' in data &&
                  isErrorCode(data.errorCode)
                    ? data.errorCode
                    : 'SERVER_UNEXPECTED';
                return { ok: false, errorCode: code };
              }
              const parsed = dataExportSchema.safeParse(data);
              return parsed.success
                ? { ok: true, data: parsed.data }
                : { ok: false, errorCode: 'SERVER_UNEXPECTED' };
            },
            (data) => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = t('fileName');
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            },
            t('done'),
          );
        }}
      >
        {form.busy ? t('downloading') : t('download')}
      </Button>
      {form.error && (
        <p role="alert" className="text-base text-danger">
          {form.error}
        </p>
      )}
    </div>
  );
}
