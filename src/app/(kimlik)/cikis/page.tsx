import { getTranslations } from 'next-intl/server';

import { signOut } from '@/server/actions/auth';

import { SignOutButton } from './sign-out-button';

export default async function SignOutPage() {
  const t = await getTranslations('authScreens.signOut');
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
      <p className="mt-4 text-base leading-relaxed text-fg-muted">{t('description')}</p>
      <SignOutButton submit={signOut} />
    </div>
  );
}
