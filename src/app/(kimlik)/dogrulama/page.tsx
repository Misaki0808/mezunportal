import { ErrorState } from '@/components/ui';
import { getVerificationState } from '@/server/actions/auth';

import { VerificationPanel } from './verification-panel';

export const dynamic = 'force-dynamic';

export default async function VerificationPage() {
  const result = await getVerificationState().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <VerificationPanel state={result.data} />;
}
