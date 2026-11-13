import { ErrorState } from '@/components/ui';
import { MyAppointments } from '@/components/appointments/my-appointments';
import { getMyMentorSettings, listMyAppointments } from '@/server/actions/appointment';
import { searchMentors } from '@/server/actions/mentor-directory';

export const dynamic = 'force-dynamic';

export default async function MyAppointmentsPage() {
  const settings = await getMyMentorSettings().catch(() => null);
  const eligible = settings?.ok ? settings.data.eligible : false;
  const role = eligible ? 'MENTOR' : 'MENTEE';
  const [result, directory] = await Promise.all([
    listMyAppointments({ role }).catch(() => null),
    // Dizinde görebildiği mentor var mı? Yoksa boş "Giden" durumu "Mentor bul" ile boş sayfaya göndermez.
    searchMentors({}).catch(() => null),
  ]);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <MyAppointments
      initial={result.data}
      initialRole={role}
      showSettings={eligible}
      mentorsAvailable={!(directory?.ok && directory.data.total === 0)}
      list={listMyAppointments}
    />
  );
}
