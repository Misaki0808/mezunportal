import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PhotoConsentWithdrawal } from '@/components/profile-photo/consent-withdrawal';
import { getConsentState, getFieldVisibility } from '@/server/actions/privacy';
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
  const photo = await getTranslations('profilePhoto');
  const consents = await getConsentState();
  const photoGranted =
    consents.ok &&
    consents.data.documents.some(
      (doc) => doc.documentType === 'PROFILE_PHOTO_VISIBILITY' && doc.lastDecision?.granted,
    );
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <PrivacyFrame title={t('title')} description={t('description')}>
      <VisibilityForm initial={result.data} />
      {photoGranted && <PhotoConsentWithdrawal />}
      <Link
        className="inline-flex min-h-11 items-center text-primary underline"
        href="/profil/fotograf"
      >
        {photo('privacyLink')}
      </Link>
      <ActionLink href="/onay" secondary>
        {account('consent')}
      </ActionLink>
    </PrivacyFrame>
  );
}
