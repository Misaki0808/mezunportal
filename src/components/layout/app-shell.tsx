import type { ReactNode } from 'react';

import { hasAdminAccess } from './admin-access';
import { AppShellClient } from './app-shell-client';
import { getDb } from '@/server/db';
import { requireUserWithoutConsent } from '@/server/permissions';
import { countMyUnread } from '@/server/services/inbox';

/** Yetkiyi istemci girdisinden değil sunucu korumalarından alır. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [showAdmin, actor] = await Promise.all([
    hasAdminAccess(),
    requireUserWithoutConsent().catch(() => null),
  ]);
  // Rozet süs bilgidir: sayım başarısız olursa sayfa açılır, rozet gizli kalır.
  const unread = actor ? await countMyUnread({ db: getDb() }, actor.userId).catch(() => 0) : 0;
  return (
    <AppShellClient showAdmin={showAdmin} signedIn={!!actor} unreadNotifications={unread}>
      {children}
    </AppShellClient>
  );
}
