import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { NameForm } from '@/components/account/name-form';
import { ErrorState, PageHeader } from '@/components/ui';
import { getMyAccountName, updateMyName } from '@/server/actions/account';

export const dynamic = 'force-dynamic';

export default async function AccountNamePage() {
  const t = await getTranslations('accountName');
  const result = await getMyAccountName().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <Link
        href="/hesap"
        className="press-row mb-6 inline-flex min-h-11 items-center font-medium text-primary"
      >
        ← {t('back')}
      </Link>
      <PageHeader
        className="mb-8"
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      <NameForm initialName={result.data.name} update={updateMyName} />
    </div>
  );
}
