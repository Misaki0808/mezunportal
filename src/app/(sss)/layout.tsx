import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { rejectMissingDetail } from '@/app/detail-route';

/** SSS ekranları oturum + rıza kapısının içinde; yetki her eylemde sunucuda yeniden doğrulanır. */
export default async function FaqLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  await rejectMissingDetail('faq');
  return children;
}
