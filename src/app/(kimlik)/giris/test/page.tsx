import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { testLoginSchema } from '@/contracts/auth';
import { Button } from '@/components/ui';
import { isDevToolsEnabled } from '@/lib/app-env';
import { signInAsTestPersona } from '@/server/actions/auth';

export const dynamic = 'force-dynamic';

export default async function TestSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  if (!isDevToolsEnabled()) notFound();
  const parsed = testLoginSchema.safeParse({ persona: (await searchParams).persona });
  if (!parsed.success) notFound();
  const persona = parsed.data.persona;
  const t = await getTranslations('authScreens.testSignIn');

  async function submit() {
    'use server';
    const result = await signInAsTestPersona({ persona });
    if (result.ok) redirect('/hesap');
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
