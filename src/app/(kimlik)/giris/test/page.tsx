import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { testLoginSchema } from '@/contracts/auth';
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
  const parsed = testLoginSchema.safeParse({ persona: query.persona });
  if (!parsed.success) notFound();
  const persona = parsed.data.persona;
  const t = await getTranslations('authScreens.testSignIn');

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
