import { ErrorState } from '@/components/ui';
import { NotificationPreferencesForm } from '@/components/notifications/preferences-form';
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from '@/server/actions/notifications';
export const dynamic = 'force-dynamic';
export default async function NotificationPreferencesPage() {
  const result = await getMyNotificationPreferences();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <NotificationPreferencesForm initial={result.data} save={updateMyNotificationPreferences} />
  );
}
