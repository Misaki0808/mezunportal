import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { rejectMissingDetail } from '@/app/detail-route';
export default async function PostingLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  await rejectMissingDetail('posting');
  return children;
}
