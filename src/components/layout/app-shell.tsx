import type { ReactNode } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { hasAdminAccess } from './admin-access';
import { AppShellClient } from './app-shell-client';
import { isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { requireUser, requireUserWithoutConsent } from '@/server/permissions';
import { countMyUnread } from '@/server/services/inbox';

/** Yetkiyi istemci girdisinden değil sunucu korumalarından alır. */
export async function AppShell({ children }: { children: ReactNode }) {
  const [showAdmin, actor] = await Promise.all([
    hasAdminAccess(),
    requireUserWithoutConsent().catch((error: unknown) => {
      unstable_rethrow(error);
      return null;
    }),
  ]);
  // Rozet süs bilgidir: sayım başarısız olursa sayfa açılır, rozet gizli kalır. Gezinme YALNIZ güncel onay eksikse
  // (CONSENT_REQUIRED) kapanır: veritabanı gibi başka bir hata gezinmeyi gizlememeli.
  let consented: Awaited<ReturnType<typeof requireUser>> | null = null;
  let consentPending = false;
  if (actor) {
    try {
      consented = await requireUser();
    } catch (error) {
      unstable_rethrow(error);
      consentPending = isCodedError(error) && error.code === 'CONSENT_REQUIRED';
    }
  }
  const unread = consented
    ? await countMyUnread({ db: getDb() }, consented.userId).catch(() => 0)
    : 0;
  return (
    <AppShellClient
      showAdmin={showAdmin}
      signedIn={!!actor}
      // Oturum var ama güncel onay yok: onay ekranı dışındaki her sayfa onaya geri yollar; gezinme kapalı kalır.
      consentPending={consentPending}
      canRefreshNotifications={!!consented}
      unreadNotifications={unread}
    >
      {children}
    </AppShellClient>
  );
}
