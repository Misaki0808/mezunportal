import { adminAccess } from '@/components/admin/access';
import { GoogleCalendarPanel } from '@/components/admin/google-calendar-panel';
import { ErrorState } from '@/components/ui';
import { GOOGLE_CONNECT_OUTCOMES, type GoogleConnectOutcome } from '@/contracts/google-calendar';
import {
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
} from '@/server/actions/google-calendar';

export const dynamic = 'force-dynamic';

/** Google Takvim bağlantısı yalnız sistem yöneticisine açıktır (`adminGrants` yeteneği yalnız onda var). */
export default async function GoogleCalendarAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const access = await adminAccess('adminGrants');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const status = await getGoogleCalendarStatus().catch(() => null);
  if (!status) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!status.ok) return <ErrorState errorCode={status.errorCode} />;
  const { durum } = await searchParams;
  const outcome = (GOOGLE_CONNECT_OUTCOMES as readonly string[]).includes(durum ?? '')
    ? (durum as GoogleConnectOutcome)
    : null;
  return (
    <GoogleCalendarPanel
      status={status.data}
      outcome={outcome}
      disconnect={disconnectGoogleCalendar}
    />
  );
}
