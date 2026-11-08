import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';

/** SSS ekranları oturum + rıza kapısının içinde; yetki her eylemde sunucuda yeniden doğrulanır. */
export default function FaqLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
