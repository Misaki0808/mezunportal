import type { ReactNode } from 'react';

import { hasAdminAccess } from './admin-access';
import { AppShellClient } from './app-shell-client';

/** Yetkiyi istemci girdisinden değil sunucu korumalarından alır. */
export async function AppShell({ children }: { children: ReactNode }) {
  return <AppShellClient showAdmin={await hasAdminAccess()}>{children}</AppShellClient>;
}
