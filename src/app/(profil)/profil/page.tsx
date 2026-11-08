import { MyProfile } from '@/components/profile/my-profile';
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

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const result = await getMyProfile().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <MyProfile
      initial={result.data}
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
  );
}
