import { getTranslations } from 'next-intl/server';

import { requestEmailChange } from '@/server/actions/auth';

import { EmailChangeForm } from './email-change-form';

export default async function EmailChangePage() {
  const t = await getTranslations('authScreens.emailChange');
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <header className="mb-10">
        <p className="mb-2 text-base font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">{t('description')}</p>
      </header>
      <EmailChangeForm submit={requestEmailChange} />
    </div>
  );
}
