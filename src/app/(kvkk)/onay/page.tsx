import { getTranslations } from 'next-intl/server';
import { getConsentState } from '@/server/actions/privacy';
import { ErrorState } from '@/components/ui';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ConsentForm } from '@/components/privacy/consent-form';
export const dynamic = 'force-dynamic';
export default async function ConsentPage() {
  const [result, t] = await Promise.all([
    getConsentState(),
    getTranslations('privacyScreens.consent'),
  ]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const state = result.data;
  const renew = state.blocking && state.documents.some((d) => d.lastDecision !== null);
  const title = state.blocking ? t(renew ? 'renewTitle' : 'title') : t('manageTitle');
  const description = state.blocking
    ? t(renew ? 'renewDescription' : 'description')
    : t('manageDescription');
  return (
    <PrivacyFrame title={title} description={description}>
      <ConsentForm key={state.documents.map((d) => d.currentVersion).join(':')} state={state} />
    </PrivacyFrame>
  );
}
