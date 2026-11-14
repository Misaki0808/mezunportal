import { ErrorState } from '@/components/ui';
import {
  getOnboardingState,
  listProfileTags,
  saveOnboardingStep,
  skipOnboardingStep,
} from '@/server/actions/profile';
import { getFieldVisibility, setFieldVisibility } from '@/server/actions/privacy';
import { getMyAccountName, updateMyName } from '@/server/actions/account';
import { NameForm } from '@/components/account/name-form';

import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ duzenle?: string }>;
}) {
  const query = await searchParams;
  const results = await Promise.all([
    getOnboardingState(),
    listProfileTags({ kind: 'INTEREST' }),
    listProfileTags({ kind: 'GOAL' }),
    getFieldVisibility(),
    getMyAccountName(),
  ]).catch(() => null);
  if (!results) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  const [state, interests, goals, visibility, accountName] = results;
  if (!state.ok) return <ErrorState errorCode={state.errorCode} />;
  if (!interests.ok) return <ErrorState errorCode={interests.errorCode} />;
  if (!goals.ok) return <ErrorState errorCode={goals.errorCode} />;
  if (!visibility.ok) return <ErrorState errorCode={visibility.errorCode} />;
  if (!accountName.ok) return <ErrorState errorCode={accountName.errorCode} />;
  return (
    <OnboardingFlow
      initialState={state.data}
      editInitially={query.duzenle === '1'}
      interests={interests.data.tags}
      goals={goals.data.tags}
      initialVisibility={visibility.data}
      saveVisibility={setFieldVisibility}
      nameCard={
        <NameForm initialName={accountName.data.name} update={updateMyName} variant="onboarding" />
      }
      save={saveOnboardingStep}
      skip={skipOnboardingStep}
    />
  );
}
