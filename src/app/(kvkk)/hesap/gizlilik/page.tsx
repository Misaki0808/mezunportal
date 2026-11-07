import { getTranslations } from 'next-intl/server';
import { getFieldVisibility } from '@/server/actions/privacy';
import { ErrorState } from '@/components/ui';
import { ActionLink } from '@/app/(kimlik)/action-link';
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
      <ActionLink href="/onay" secondary>
        {account('consent')}
      </ActionLink>
    </PrivacyFrame>
  );
}
