import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';

/** Profil ekranları oturum + rıza kapısının içinde; yetki ve görünürlük her eylemde sunucuda yeniden uygulanır. */
export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
