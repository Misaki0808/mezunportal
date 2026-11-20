'use client';

import { useTranslations } from 'next-intl';
import { Card, buttonClasses } from '@/components/ui';
import { isErrorCode } from '@/lib/errors';
import { usePrivacyForm } from './form-state';

type CvFile = { id: string; date: string; hasFile: boolean };

function CvDownload({ file, index }: { file: CvFile; index: number }) {
  const t = useTranslations('privacyScreens.export');
  const form = usePrivacyForm();
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border py-3">
      <span>{t('cvDate', { date: file.date })}</span>
      {file.hasFile ? (
        <a
          href={`/api/hesabim/cv/${encodeURIComponent(file.id)}`}
          download="cv.pdf"
          className={buttonClasses({ variant: 'secondary' })}
          aria-label={t('cvDownloadItem', { number: index + 1 })}
          aria-disabled={form.busy || undefined}
          onClick={(event) => {
            event.preventDefault();
            if (form.busy) return;
            void form.run(
              async () => {
                const response = await fetch(`/api/hesabim/cv/${encodeURIComponent(file.id)}`, {
                  cache: 'no-store',
                });
                if (!response.ok) {
                  const value: unknown = await response.json().catch(() => null);
                  const code =
                    value &&
                    typeof value === 'object' &&
                    'errorCode' in value &&
                    isErrorCode(value.errorCode)
                      ? value.errorCode
                      : 'SERVER_UNEXPECTED';
                  return { ok: false, errorCode: code };
                }
                return { ok: true, data: await response.blob() };
              },
              (blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'cv.pdf';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              },
            );
          }}
        >
          {form.busy ? t('cvDownloading') : t('cvDownload')}
        </a>
      ) : (
        <span className="text-fg-muted">{t('cvUnavailable')}</span>
      )}
      {form.error && (
        <p role="alert" className="w-full text-danger">
          {form.error}
        </p>
      )}
    </li>
  );
}

export function CvDownloads({ files }: { files: CvFile[] }) {
  const t = useTranslations('privacyScreens.export');
  if (!files.length) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">{t('cvTitle')}</h2>
      <p className="text-base text-fg-muted">{t('cvDescription')}</p>
      <ul>
        {files.map((file, index) => (
          <CvDownload key={file.id} file={file} index={index} />
        ))}
      </ul>
    </Card>
  );
}
