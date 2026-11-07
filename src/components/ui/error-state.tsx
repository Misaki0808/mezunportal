'use client';

import { useTranslations } from 'next-intl';

import type { ErrorCode } from '@/lib/errors';

import { Button } from './button';
import { cn } from './cn';
import { AlertIcon } from './icons';

export type ErrorStateProps = {
  /** Kararlı hata kodu; metin `errors.codes` kataloğundan gelir, ham `err.message` basılmaz. */
  errorCode: ErrorCode;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ errorCode, onRetry, className }: ErrorStateProps) {
  const t = useTranslations('ui.errorState');
  const codes = useTranslations('errors.codes');

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}
    >
      <span className="text-danger">
        <AlertIcon width={40} height={40} strokeWidth={1.5} />
      </span>
      <h2 className="text-lg font-semibold text-fg">{t('title')}</h2>
      <p className="max-w-prose text-fg-muted">{codes(errorCode)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}
