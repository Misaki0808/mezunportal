import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { rejectMissingDetail } from '@/app/detail-route';

/** Randevu ekranları oturum + rıza kapısının içinde; yetki her eylemde sunucuda yeniden doğrulanır. */
export default async function AppointmentLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  await rejectMissingDetail('appointment');
  return children;
}
