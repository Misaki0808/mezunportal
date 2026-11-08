import { ErrorState } from '@/components/ui';
import { MyAppointments } from '@/components/appointments/my-appointments';
import { getMyMentorSettings, listMyAppointments } from '@/server/actions/appointment';

export const dynamic = 'force-dynamic';

export default async function MyAppointmentsPage() {
  const settings = await getMyMentorSettings().catch(() => null);
  const eligible = settings?.ok ? settings.data.eligible : false;
  const role = eligible ? 'MENTOR' : 'MENTEE';
  const result = await listMyAppointments({ role }).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <MyAppointments
      initial={result.data}
      initialRole={role}
      showSettings={eligible}
      list={listMyAppointments}
    />
  );
}
