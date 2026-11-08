import { MentorSettings } from '@/components/appointments/mentor-settings';
import { ErrorState } from '@/components/ui';
import {
  getMyMentorSettings,
  saveAvailability,
  saveMentorSettings,
  setPause,
} from '@/server/actions/appointment';

export const dynamic = 'force-dynamic';

export default async function MentorSettingsPage() {
  const result = await getMyMentorSettings().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <MentorSettings
      initial={result.data}
      actions={{ saveSettings: saveMentorSettings, saveAvailability, setPause }}
    />
  );
}
