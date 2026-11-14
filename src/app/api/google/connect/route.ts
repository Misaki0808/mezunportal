import { NextResponse } from 'next/server';

import { GOOGLE_ADMIN_HREF } from '@/contracts/google-calendar';
import { isCodedError } from '@/lib/errors';
import { getAuthEnv } from '@/lib/env';
import { getDb } from '@/server/db';
import { OAUTH_STATE_COOKIE } from '@/server/external/calendar/google-oauth';
import { requireAdmin } from '@/server/permissions';
import { beginGoogleAuthorization } from '@/server/services/google-calendar-connection';
import { logUnexpected } from '@/server/unexpected-log';

// Google Takvim'i bağlama başlangıcı (kart 174): yalnız sistem yöneticisi. Yönlendirme adresindeki `state`/PKCE bilgisi imzalı, httpOnly
// çerezde de durur; dönüşte (`/api/google/callback`) eşleşmezse bağlama reddedilir. Yanıtlar önbelleğe alınmaz.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' } as const;

export async function GET() {
  const { APP_URL } = getAuthEnv();
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const start = await beginGoogleAuthorization({ db: getDb() }, actor.userId);
    if (!start)
      return NextResponse.redirect(new URL(`${GOOGLE_ADMIN_HREF}?durum=not-configured`, APP_URL), {
        status: 303,
        headers: NO_STORE,
      });
    const response = NextResponse.redirect(start.url, { status: 303, headers: NO_STORE });
    response.cookies.set(OAUTH_STATE_COOKIE, start.cookie.value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: APP_URL.startsWith('https:'),
      path: '/api/google',
      maxAge: start.cookie.maxAgeSeconds,
    });
    return response;
  } catch (error) {
    if (isCodedError(error) && error.kind === 'unauthenticated') {
      const login = new URL('/giris', APP_URL);
      login.searchParams.set('donus', GOOGLE_ADMIN_HREF);
      return NextResponse.redirect(login, { status: 303, headers: NO_STORE });
    }
    logUnexpected('route', 'googleConnect', error);
    return new Response(null, { status: isCodedError(error) ? 403 : 500, headers: NO_STORE });
  }
}
