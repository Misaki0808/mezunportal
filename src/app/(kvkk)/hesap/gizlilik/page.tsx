import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getFieldVisibility } from '@/server/actions/privacy';
import { ErrorState, buttonClasses } from '@/components/ui';
import { PrivacyFrame } from '@/components/privacy/frame';
import { VisibilityForm } from '@/components/privacy/visibility-form';
export const dynamic = 'force-dynamic';
export default async function VisibilityPage() {
  const [result, t, account] = await Promise.all([
    getFieldVisibility(),
    getTranslations('privacyScreens.visibility'),
    getTranslations('privacyScreens.account'),
  ]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <PrivacyFrame title={t('title')} description={t('description')}>
      <VisibilityForm initial={result.data} />
      <Link href="/onay" className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
        {account('consent')}
      </Link>
    </PrivacyFrame>
  );
}
