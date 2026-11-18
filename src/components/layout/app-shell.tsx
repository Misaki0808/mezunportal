import type { ReactNode } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { hasAdminAccess } from './admin-access';
import { AppShellClient } from './app-shell-client';
import { isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { requireUser, requireUserWithoutConsent } from '@/server/permissions';
import { canUseCourseGuide } from '@/server/permissions/course-guide-access';
import { countMyUnread } from '@/server/services/inbox';
import { getShellUser } from '@/server/services/shell-user';

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
  // Yan menü alt kartı da süstür: okunamazsa kart çizilmez, sayfa açılır.
  const [unread, shellUser] = consented
    ? await Promise.all([
        countMyUnread({ db: getDb() }, consented.userId).catch(() => 0),
        getShellUser({ db: getDb() }, consented.userId).catch(() => null),
      ])
    : [0, null];
  return (
    <AppShellClient
      showAdmin={showAdmin}
      // "Ders rehberi" yalnız erişebilen role görünür (hesap ayarlarıyla aynı koşul); yetkiyi sunucu verir.
      showCourseGuide={actor ? canUseCourseGuide(actor.facts) : false}
      signedIn={!!actor}
      // Oturum var ama güncel onay yok: onay ekranı dışındaki her sayfa onaya geri yollar; gezinme kapalı kalır.
      consentPending={consentPending}
      canRefreshNotifications={!!consented}
      unreadNotifications={unread}
      shellUser={shellUser}
    >
      {children}
    </AppShellClient>
  );
}
