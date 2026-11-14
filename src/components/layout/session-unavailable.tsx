'use client';

import { useTranslations } from 'next-intl';
import { BrandLogo } from '@/components/brand/logo';
import { Button, ErrorState } from '@/components/ui';

/** Ortak arıza sınırında yalnız yeniden deneme sunulur; oturum doğrulanmamıştır. */
export function SessionUnavailable() {
  const nav = useTranslations('nav');
  const t = useTranslations('ui.errorState');
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8">
      <BrandLogo className="h-8 w-auto" label={nav('brand')} />
      <ErrorState errorCode="SERVER_UNEXPECTED" />
      <Button variant="secondary" onClick={() => window.location.reload()}>
        {t('sessionRetry')}
      </Button>
    </main>
  );
}
