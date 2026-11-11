import { notFound } from 'next/navigation';

import { SlotPicker } from '@/components/appointments/slot-picker';
import { ErrorState } from '@/components/ui';
import { requestMentorSlots } from '@/app/detail-route';
import { requestAppointment } from '@/server/actions/appointment';

export const dynamic = 'force-dynamic';

export default async function RequestAppointmentPage({
  params,
}: {
  params: Promise<{ mentorId: string }>;
}) {
  const { mentorId } = await params;
  const result = await requestMentorSlots(mentorId).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) {
    if (result.errorCode === 'RESOURCE_NOT_FOUND') notFound();
    return <ErrorState errorCode={result.errorCode} />;
  }
  return <SlotPicker list={result.data} request={requestAppointment} />;
}
