import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PrivacyFrame } from '@/components/privacy/frame';
import { DeleteForm } from '@/components/privacy/delete-form';
export default async function DeletePage() {
  const t = await getTranslations('privacyScreens.delete');
  return (
    <PrivacyFrame title={t('title')} description={t('description')}>
      <Link
        href="/hesap/veriler"
        className="press-row inline-flex min-h-11 items-center font-medium text-primary"
      >
        {t('download')} ↗
      </Link>
      <DeleteForm />
    </PrivacyFrame>
  );
}
