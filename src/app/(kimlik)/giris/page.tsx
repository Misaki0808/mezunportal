import { getTranslations } from 'next-intl/server';

import { SIGN_IN_CALLBACK_ERROR_CODES, SIGN_IN_ERROR_QUERY_PARAM } from '@/contracts/auth';
import { ErrorState, PageHeader } from '@/components/ui';
import { RETURN_PATH_PARAM, safeReturnPath } from '@/lib/return-path';
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
  const returnTo = safeReturnPath(query[RETURN_PATH_PARAM]);
  const requested = query[SIGN_IN_ERROR_QUERY_PARAM];
  const callbackError = SIGN_IN_CALLBACK_ERROR_CODES.find((code) => code === requested);
  const options = await getSignInOptions().catch(() => null);
  if (!options) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!options.ok) return <ErrorState errorCode={options.errorCode} />;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <PageHeader
        className="mb-10"
        eyebrow={t('eyebrow')}
        title={t(returnTo ? 'continueTitle' : 'title')}
        description={t.rich('description', {
          email: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
        })}
      />
      <SignInForm
        options={options.data}
        callbackError={callbackError}
        returnTo={returnTo ?? undefined}
        requestLink={requestSignInLink}
        startLinkedIn={startLinkedInSignIn}
      />
    </div>
  );
}
