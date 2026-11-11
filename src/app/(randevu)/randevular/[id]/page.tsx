import { requestAppointmentDetail } from '@/app/detail-route';
import { getFeedbackView } from '@/server/actions/feedback';
import { notFound } from 'next/navigation';

import { AppointmentDetail } from '@/components/appointments/appointment-detail';
import { ErrorState } from '@/components/ui';
import { cancelAppointment, respondAppointment, setMeetLink } from '@/server/actions/appointment';

export const dynamic = 'force-dynamic';

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requestAppointmentDetail(id).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) {
    if (result.errorCode === 'RESOURCE_NOT_FOUND') notFound();
    return <ErrorState errorCode={result.errorCode} />;
  }
  const feedback = await getFeedbackView(id).catch(() => null);
  return (
    <AppointmentDetail
      appointment={result.data}
      feedbackAvailable={Boolean(feedback?.ok && !feedback.data.submitted)}
      actions={{ respond: respondAppointment, cancel: cancelAppointment, setMeetLink }}
    />
  );
}
