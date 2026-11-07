import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';
export default function PrivacyAccountLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
