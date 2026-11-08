import { ErrorState } from '@/components/ui';
export default function NotFound() {
  return <ErrorState errorCode="RESOURCE_NOT_FOUND" />;
}
