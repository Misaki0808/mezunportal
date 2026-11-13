import type { ReactNode } from 'react';

import { hasAdminAccess } from './admin-access';
import { AppShellClient } from './app-shell-client';
import { getDb } from '@/server/db';
import { requireUser, requireUserWithoutConsent } from '@/server/permissions';
import { countMyUnread } from '@/server/services/inbox';

/** Yetkiyi istemci girdisinden değil sunucu korumalarından alır. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [showAdmin, actor] = await Promise.all([
    hasAdminAccess(),
    requireUserWithoutConsent().catch(() => null),
  ]);
  // Rozet süs bilgidir: sayım başarısız olursa sayfa açılır, rozet gizli kalır.
  const consented = actor ? await requireUser().catch(() => null) : null;
  const unread = consented
    ? await countMyUnread({ db: getDb() }, consented.userId).catch(() => 0)
    : 0;
  return (
    <AppShellClient
      showAdmin={showAdmin}
      signedIn={!!actor}
      // Oturum var ama güncel onay yok: onay ekranı dışındaki her sayfa onaya geri yollar; gezinme kapalı kalır.
      consentPending={!!actor && !consented}
      canRefreshNotifications={!!consented}
      unreadNotifications={unread}
    >
      {children}
    </AppShellClient>
  );
}
