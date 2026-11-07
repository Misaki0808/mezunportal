import { getTranslations } from 'next-intl/server';

import { SIGN_IN_CALLBACK_ERROR_CODES, SIGN_IN_ERROR_QUERY_PARAM } from '@/contracts/auth';
import { ErrorState } from '@/components/ui';
import { getSignInOptions, requestSignInLink, startLinkedInSignIn } from '@/server/actions/auth';

import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('authScreens.signIn');
  const query = await searchParams;
  const requested = query[SIGN_IN_ERROR_QUERY_PARAM];
  const callbackError = SIGN_IN_CALLBACK_ERROR_CODES.find((code) => code === requested);
  const options = await getSignInOptions().catch(() => null);
  if (!options) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!options.ok) return <ErrorState errorCode={options.errorCode} />;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <header className="mb-10">
        <p className="mb-2 text-base font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">{t('description')}</p>
      </header>
      <SignInForm
        options={options.data}
        callbackError={callbackError}
        requestLink={requestSignInLink}
        startLinkedIn={startLinkedInSignIn}
      />
    </div>
  );
}
