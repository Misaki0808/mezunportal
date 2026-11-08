import { MyProfile } from '@/components/profile/my-profile';
import { Contribution, ContributionSummary } from '@/components/points/contribution';
import { ErrorState } from '@/components/ui';
import {
  addProfileSkill,
  deleteProfileEntry,
  getMyProfile,
  removeProfileSkill,
  saveProfileEntry,
  setLinkedinUrl,
  setSocialLinks,
  suggestSkills,
  updateProfileBasics,
} from '@/server/actions/profile-content';
import { getMyContribution } from '@/server/actions/points';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const result = await getMyProfile().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const points = await getMyContribution({}).catch(() => null);
  return (
    <>
      <MyProfile
        initial={result.data}
        beforeCompletion={
          points?.ok ? <ContributionSummary summary={points.data.summary} /> : undefined
        }
        actions={{
          updateBasics: updateProfileBasics,
          setSocialLinks,
          setLinkedinUrl,
          saveEntry: saveProfileEntry,
          deleteEntry: deleteProfileEntry,
          addSkill: addProfileSkill,
          removeSkill: removeProfileSkill,
          suggestSkills,
        }}
      />
      {points?.ok && (
        <div className="mx-auto max-w-2xl px-5 pb-12">
          <Contribution initial={points.data} list={getMyContribution} variant="history" />
        </div>
      )}
    </>
  );
}
