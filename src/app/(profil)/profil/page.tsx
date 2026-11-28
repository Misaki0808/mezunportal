import { MyProfile } from '@/components/profile/my-profile';
import { getTranslations } from 'next-intl/server';
import { getMyMentorRating } from '@/server/actions/feedback';
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
import { AlumniVisibilitySetting } from '@/components/alumni/visibility-setting';
import { getAlumniVisibility, setAlumniVisibility } from '@/server/actions/alumni-directory';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const result = await getMyProfile().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const points = await getMyContribution({}).catch(() => null);
  const rating = await getMyMentorRating().catch(() => null);
  const feedback = await getTranslations('feedback');
  const gap = await getSkillGap().catch(() => null);
  const titles = gap?.ok ? await listSkillGapTitles().catch(() => null) : null;
  const alumniVisibility = await getAlumniVisibility();
  return (
    <>
      <MyProfile
        initial={result.data}
        beforeCompletion={
          <>
            {points?.ok && <ContributionSummary summary={points.data.summary} />}
            {rating?.ok && rating.data && (
              <p>
                {feedback('ratingSummary', {
                  average: new Intl.NumberFormat('tr-TR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }).format(rating.data.average),
                  count: rating.data.count,
                })}
              </p>
            )}
          </>
        }
        afterSections={
          <>
            {alumniVisibility.ok ? (
              <AlumniVisibilitySetting initial={alumniVisibility.data} save={setAlumniVisibility} />
            ) : (
              <ErrorState errorCode={alumniVisibility.errorCode} />
            )}
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
        <div className="mt-6 w-full max-w-4xl">
          <Contribution initial={points.data} list={getMyContribution} variant="history" />
        </div>
      )}
    </>
  );
}
