import type { ReactNode } from 'react';
import { PrivacyGuard } from '@/components/privacy/server-guard';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <PrivacyGuard>{children}</PrivacyGuard>;
}
