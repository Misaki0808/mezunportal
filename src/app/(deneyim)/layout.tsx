import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { rejectMissingDetail } from '@/app/detail-route';

/** Deneyim ekranları oturum + rıza kapısının içinde; yetki ve kapsam her eylemde sunucuda yeniden doğrulanır. */
export default async function ExperienceLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  await rejectMissingDetail('experience');
  return children;
}
