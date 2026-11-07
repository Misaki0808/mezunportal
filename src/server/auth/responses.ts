import { AUTH_PATHS, SIGN_IN_ERROR_QUERY_PARAM } from '@/contracts/auth';
import type { ErrorCode } from '@/lib/errors';

/**
 * Better Auth bağlantı uçlarının (`/magic-link/verify`, `/verify-email`, `/callback/linkedin`) hata
 * yanıtlarını ekranın anladığı biçime çevirir: kullanıcı bağlantıya TIKLADIĞI için ham JSON/`?error=`
 * görmez, `/giris?hata=<ErrorCode>` sayfasına düşer (`SIGN_IN_ERROR_QUERY_PARAM`).
 */
export function authErrorCodeFor(raw: string | null | undefined, pathname: string): ErrorCode {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('banned')) return 'AUTH_ACCOUNT_SUSPENDED';
  if (value.includes('rate') || value === '429') return 'RATE_LIMITED';
  if (value.includes('token') || value === 'invalid_token' || value === 'expired_token') {
    return 'AUTH_LINK_INVALID';
  }
  return pathname.includes('/callback/') ? 'AUTH_PROVIDER_FAILED' : 'AUTH_LINK_INVALID';
}

function redirectTo(location: string): Response {
  const headers = new Headers();
  headers.set('location', location);
  headers.set('cache-control', 'no-store');
  // Hata yanıtına çerez TAŞINMAZ; yalnız başarılı akışın çerezleri geçer (orada bu işlev çağrılmaz).
  return new Response(null, { status: 302, headers });
}

export async function mapAuthResponse(response: Response, pathname: string): Promise<Response> {
  const location = response.headers.get('location');
  const isRedirect = response.status >= 300 && response.status < 400;

  if (isRedirect && location) {
    const url = new URL(location, 'http://yerel.invalid');
    const rawError = url.searchParams.get('error');
    if (rawError === null) return response;
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    url.searchParams.set(SIGN_IN_ERROR_QUERY_PARAM, authErrorCodeFor(rawError, pathname));
    const relative = `${url.pathname}${url.search}`;
    return redirectTo(
      location.startsWith('http') ? new URL(relative, location).toString() : relative,
    );
  }

  if (response.status >= 400) {
    let code: string | null = null;
    try {
      const body: unknown = await response.clone().json();
      if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
        code = body.code;
      }
    } catch {
      // gövde JSON değil
    }
    const mapped = authErrorCodeFor(response.status === 429 ? '429' : code, pathname);
    return redirectTo(`${AUTH_PATHS.signIn}?${SIGN_IN_ERROR_QUERY_PARAM}=${mapped}`);
  }

  return response;
}
