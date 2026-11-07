import 'server-only';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getConsentState } from '@/server/actions/privacy';
import { ErrorState } from '@/components/ui';

export async function PrivacyGuard({ children }: { children: ReactNode }) {
  const result = await getConsentState();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  if (result.data.blocking) redirect('/onay');
  return children;
}
