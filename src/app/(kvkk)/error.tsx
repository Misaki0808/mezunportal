'use client';
import { ErrorState } from '@/components/ui';
export default function PrivacyError({ reset }: { reset: () => void }) {
  return <ErrorState errorCode="SERVER_UNEXPECTED" onRetry={reset} />;
}
