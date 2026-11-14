import { NextResponse, type NextRequest } from 'next/server';

import { GOOGLE_ADMIN_HREF, type GoogleConnectOutcome } from '@/contracts/google-calendar';
import { isCodedError } from '@/lib/errors';
import { getAuthEnv } from '@/lib/env';
import { getDb } from '@/server/db';
import { resetCalendar } from '@/server/external/calendar';
import { OAUTH_STATE_COOKIE } from '@/server/external/calendar/google-oauth';
import { requireAdmin } from '@/server/permissions';
import { completeGoogleAuthorization } from '@/server/services/google-calendar-connection';
import { logUnexpected } from '@/server/unexpected-log';

// Google dönüşü (kart 174). Yetkilendirme kodu ve `state` yalnız bu istekte okunur; yönlendirme adresine, loga ve hataya GİRMEZ.
// Çerez her sonuçta temizlenir (tek kullanım). Yalnız sonuç anahtarı (`durum`) yönetim sayfasına taşınır.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } as const;

export async function GET(request: NextRequest) {
  const { APP_URL } = getAuthEnv();
  // Durum çerezi TEK KULLANIMLIKTIR: sonuç ne olursa olsun (başarı, ret, giriş yönlendirmesi, yetkisizlik, beklenmeyen hata) silinir;
  // yarım kalmış bir akışın çerezi sonraki bir denemede yeniden kullanılamaz.
  const clear = <T extends Response>(response: T): T => {
    (response as unknown as NextResponse).headers.append(
      'set-cookie',
      `${OAUTH_STATE_COOKIE}=; Path=/api/google; Max-Age=0; HttpOnly; SameSite=lax`,
    );
    return response;
  };
  const done = (outcome: GoogleConnectOutcome) =>
    clear(
      NextResponse.redirect(new URL(`${GOOGLE_ADMIN_HREF}?durum=${outcome}`, APP_URL), {
        status: 303,
        headers: NO_STORE,
      }),
    );
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const params = request.nextUrl.searchParams;
    const outcome = await completeGoogleAuthorization(
      { db: getDb(), onChanged: resetCalendar },
      actor.userId,
      {
        code: params.get('code'),
        state: params.get('state'),
        error: params.get('error'),
        cookieValue: request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null,
      },
    );
    return done(outcome);
  } catch (error) {
    if (isCodedError(error) && error.kind === 'unauthenticated') {
      const login = new URL('/giris', APP_URL);
      login.searchParams.set('donus', GOOGLE_ADMIN_HREF);
      return clear(NextResponse.redirect(login, { status: 303, headers: NO_STORE }));
    }
    logUnexpected('route', 'googleCallback', error);
    return clear(
      new Response(null, { status: isCodedError(error) ? 403 : 500, headers: NO_STORE }),
    );
  }
}
