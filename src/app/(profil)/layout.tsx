import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { rejectMissingDetail } from '@/app/detail-route';

/** Profil ekranları oturum + rıza kapısının içinde; yetki ve görünürlük her eylemde sunucuda yeniden uygulanır. */
export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  await rejectMissingDetail('profile');
  return children;
}
