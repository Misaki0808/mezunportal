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
import { getSkillGap, listSkillGapTitles } from '@/server/actions/skill-gap';
import { SkillGapPanel } from '@/components/skill-gap/skill-gap-panel';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const result = await getMyProfile().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const points = await getMyContribution({}).catch(() => null);
  const gap = await getSkillGap().catch(() => null);
  const titles = gap?.ok ? await listSkillGapTitles().catch(() => null) : null;
  return (
    <>
      <MyProfile
        initial={result.data}
        beforeCompletion={
          <>
            {points?.ok && <ContributionSummary summary={points.data.summary} />}
            {gap?.ok && titles?.ok && <SkillGapPanel data={gap.data} titles={titles.data} />}
            {gap?.ok && !titles?.ok && (
              <ErrorState
                errorCode={titles && !titles.ok ? titles.errorCode : 'SERVER_UNEXPECTED'}
              />
            )}
            {!gap && <ErrorState errorCode="SERVER_UNEXPECTED" />}
            {gap && !gap.ok && gap.errorCode !== 'AUTH_FORBIDDEN' && (
              <ErrorState errorCode={gap.errorCode} />
            )}
          </>
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
