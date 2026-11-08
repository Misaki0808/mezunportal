import { notFound } from 'next/navigation';

import { AppointmentDetail } from '@/components/appointments/appointment-detail';
import { ErrorState } from '@/components/ui';
import {
  cancelAppointment,
  getAppointment,
  respondAppointment,
  setMeetLink,
} from '@/server/actions/appointment';

export const dynamic = 'force-dynamic';

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAppointment({ appointmentId: id }).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) {
    if (result.errorCode === 'RESOURCE_NOT_FOUND') notFound();
    return <ErrorState errorCode={result.errorCode} />;
  }
  return (
    <AppointmentDetail
      appointment={result.data}
      actions={{ respond: respondAppointment, cancel: cancelAppointment, setMeetLink }}
    />
  );
}
