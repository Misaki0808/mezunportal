import { ErrorState } from '@/components/ui';
import { getOnboardingState, listProfileTags, saveOnboardingStep } from '@/server/actions/profile';
import { getFieldVisibility, setFieldVisibility } from '@/server/actions/privacy';

import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const results = await Promise.all([
    getOnboardingState(),
    listProfileTags({ kind: 'INTEREST' }),
    listProfileTags({ kind: 'GOAL' }),
    getFieldVisibility(),
  ]).catch(() => null);
  if (!results) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  const [state, interests, goals, visibility] = results;
  if (!state.ok) return <ErrorState errorCode={state.errorCode} />;
  if (!interests.ok) return <ErrorState errorCode={interests.errorCode} />;
  if (!goals.ok) return <ErrorState errorCode={goals.errorCode} />;
  if (!visibility.ok) return <ErrorState errorCode={visibility.errorCode} />;
  return (
    <OnboardingFlow
      initialState={state.data}
      interests={interests.data.tags}
      goals={goals.data.tags}
      initialVisibility={visibility.data}
      saveVisibility={setFieldVisibility}
      save={saveOnboardingStep}
    />
  );
}
