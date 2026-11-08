import { ErrorState } from '@/components/ui';
import { SeekerSettingsScreen } from '@/components/job-seekers/settings';
import { getMySeekerSettings } from '@/server/actions/job-seekers';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const result = await getMySeekerSettings();
  return result.ok ? (
    <SeekerSettingsScreen initial={result.data} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}
