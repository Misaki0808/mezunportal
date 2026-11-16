import { getTranslations } from 'next-intl/server';

import { AccountFrame } from '@/components/account/account-frame';
import { NameForm } from '@/components/account/name-form';
import { ErrorState } from '@/components/ui';
import { getMyAccountName, updateMyName } from '@/server/actions/account';

export const dynamic = 'force-dynamic';

export default async function AccountNamePage() {
  const t = await getTranslations('accountName');
  const result = await getMyAccountName().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <AccountFrame
      eyebrow={t('eyebrow')}
      title={t('title')}
      description={t('description')}
      backLabel={t('back')}
      width="max-w-2xl"
    >
      <div className="max-w-lg">
        <NameForm initialName={result.data.name} update={updateMyName} />
      </div>
    </AccountFrame>
  );
}
