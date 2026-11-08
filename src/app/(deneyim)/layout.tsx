import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';

/** Deneyim ekranları oturum + rıza kapısının içinde; yetki ve kapsam her eylemde sunucuda yeniden doğrulanır. */
export default function ExperienceLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
