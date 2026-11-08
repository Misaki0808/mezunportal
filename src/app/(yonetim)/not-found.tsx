import { ErrorState } from '@/components/ui';
export default function AdminNotFound() {
  return <ErrorState errorCode="AUTH_FORBIDDEN" />;
}
