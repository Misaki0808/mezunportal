import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';

/** Randevu ekranları oturum + rıza kapısının içinde; yetki her eylemde sunucuda yeniden doğrulanır. */
export default function AppointmentLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
