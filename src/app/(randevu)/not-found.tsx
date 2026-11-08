import { ErrorState } from '@/components/ui';
export default function AppointmentNotFound() {
  return <ErrorState errorCode="RESOURCE_NOT_FOUND" />;
}
