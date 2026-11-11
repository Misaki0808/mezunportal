import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { TEST_LOGIN_PERSONAS, testLoginSchema } from '@/contracts/auth';
import { Button } from '@/components/ui';
import { isDevToolsEnabled } from '@/lib/app-env';
import { RETURN_PATH_PARAM, safeReturnPath } from '@/lib/return-path';
import { signInAsTestPersona } from '@/server/actions/auth';

export const dynamic = 'force-dynamic';

export default async function TestSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; donus?: string }>;
}) {
  if (!isDevToolsEnabled()) notFound();
  const query = await searchParams;
  // Gerçek giriş akışı gibi: güvenli dönüş yolu varsa girişten sonra oraya dönülür.
  const returnTo = safeReturnPath(query[RETURN_PATH_PARAM]);
  const t = await getTranslations('authScreens.testSignIn');
  if (query.persona === undefined) {
    return (
      <div className="mx-auto max-w-lg px-5 py-12">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <p className="mt-3 text-fg-muted">{t('chooseRole')}</p>
        <ul className="mt-6 space-y-3">
          {TEST_LOGIN_PERSONAS.map((persona) => {
            const params = new URLSearchParams({ persona });
            if (returnTo) params.set(RETURN_PATH_PARAM, returnTo);
            return (
              <li key={persona}>
                <Link
                  href={`/giris/test?${params}`}
                  className="press-row flex min-h-14 items-center rounded-card border border-border bg-surface px-5 py-3 font-semibold shadow-card"
                >
                  {t(`personas.${persona}`)}{' '}
                  <span aria-hidden="true" className="ml-auto">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  const parsed = testLoginSchema.safeParse({ persona: query.persona });
  if (!parsed.success) notFound();
  const persona = parsed.data.persona;

  async function submit() {
    'use server';
    const result = await signInAsTestPersona({ persona });
    if (result.ok) redirect(returnTo ?? '/hesap');
    redirect('/giris');
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <form action={submit} className="mt-6">
        <Button type="submit">{t('submit')}</Button>
      </form>
    </div>
  );
}
