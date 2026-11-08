import type { ReactNode } from 'react';

import { hasAdminAccess } from './admin-access';
import { AppShellClient } from './app-shell-client';
import { requireUserWithoutConsent } from '@/server/permissions';

/** Yetkiyi istemci girdisinden değil sunucu korumalarından alır. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [showAdmin, actor] = await Promise.all([
    hasAdminAccess(),
    requireUserWithoutConsent().catch(() => null),
  ]);
  return (
    <AppShellClient showAdmin={showAdmin} signedIn={!!actor}>
      {children}
    </AppShellClient>
  );
}
