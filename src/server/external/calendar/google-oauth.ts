import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Google OAuth 2.0 yetkilendirme kodu akışı yardımcıları (kart 174): saf işlevler + `fetch` ile jeton değişimi/iptali. YENİ BAĞIMLILIK
 * YOK. İlkeler:
 *  - Kapsam yalnız `calendar.events` (etkinlik oluştur/güncelle/sil; başka veri okunmaz). `access_type=offline` + `prompt=consent`:
 *    yenileme jetonu her bağlamada gelir. PKCE (S256) + `state` CSRF: ikisi de yöneticinin tarayıcısındaki imzalı, httpOnly çerezde
 *    durur ve yöneticinin kimliğine, süreye ve tek kullanıma bağlıdır; uyuşmazlık reddedilir.
 *  - Kod, jeton, istemci sırrı ve sağlayıcı yanıtı hiçbir yere (log, hata, yönlendirme adresi) yazılmaz; hata kodları kararlıdır.
 */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const OAUTH_STATE_COOKIE = 'mp_google_oauth';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const STATE_KEY_INFO = 'mezunportal:google-oauth-state:v1';

export type OAuthStateCookie = { value: string; maxAgeSeconds: number };
export type OAuthStart = { url: string; nonce: string; cookie: OAuthStateCookie };

export type OAuthFailure =
  | 'GOOGLE_STATE_INVALID'
  | 'GOOGLE_STATE_EXPIRED'
  | 'GOOGLE_EXCHANGE_FAILED'
  | 'GOOGLE_NO_REFRESH_TOKEN'
  | 'GOOGLE_SCOPE_MISSING';

export class GoogleOAuthError extends Error {
  constructor(readonly code: OAuthFailure) {
    super(code);
    this.name = 'GoogleOAuthError';
  }
}

const b64 = (bytes: Buffer) => bytes.toString('base64url');
const stateKey = (secret: string) =>
  Buffer.from(hkdfSync('sha256', secret, 'mezunportal.oauth.salt', STATE_KEY_INFO, 32));
const sign = (payload: string, secret: string) =>
  createHmac('sha256', stateKey(secret)).update(payload).digest('base64url');

export const redirectUriFor = (appUrl: string) =>
  new URL('/api/google/callback', appUrl).toString();

const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Yetkilendirme adresini ve imzalı durum çerezini üretir. `nonce` = `state` parametresi. */
export function buildAuthorization(input: {
  clientId: string;
  appUrl: string;
  secret: string;
  userId: string;
  now: number;
}): OAuthStart {
  const nonce = b64(randomBytes(24));
  const verifier = b64(randomBytes(48));
  const payload = b64(
    Buffer.from(
      JSON.stringify({ n: nonce, v: verifier, u: input.userId, e: input.now + OAUTH_STATE_TTL_MS }),
    ),
  );
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: redirectUriFor(input.appUrl),
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: nonce,
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return {
    url: url.toString(),
    nonce,
    cookie: {
      value: `${payload}.${sign(payload, input.secret)}`,
      maxAgeSeconds: OAUTH_STATE_TTL_MS / 1000,
    },
  };
}

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Çerez + `state` doğrulaması: imza, süre, yönetici kimliği ve `state` eşleşmesi. Başarıda PKCE doğrulayıcısını döner.
 * Her hata ayrıntısız bir kod verir (neyin tutmadığı saldırgana söylenmez).
 */
export function verifyAuthorization(input: {
  cookieValue: string | null | undefined;
  state: string | null | undefined;
  userId: string;
  secret: string;
  now: number;
}): { verifier: string } {
  const invalid = () => new GoogleOAuthError('GOOGLE_STATE_INVALID');
  const [payload, signature, ...rest] = (input.cookieValue ?? '').split('.');
  if (!payload || !signature || rest.length > 0 || !input.state) throw invalid();
  if (!safeEqual(signature, sign(payload, input.secret))) throw invalid();
  let data: { n?: unknown; v?: unknown; u?: unknown; e?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof data;
  } catch {
    throw invalid();
  }
  if (
    typeof data.n !== 'string' ||
    typeof data.v !== 'string' ||
    typeof data.u !== 'string' ||
    typeof data.e !== 'number'
  )
    throw invalid();
  if (!safeEqual(data.n, input.state) || data.u !== input.userId) throw invalid();
  if (data.e < input.now) throw new GoogleOAuthError('GOOGLE_STATE_EXPIRED');
  return { verifier: data.v };
}

export type ExchangedTokens = { refreshToken: string; accessToken: string; scope: string };

/** Yetkilendirme kodunu jetonlara çevirir. Yenileme jetonu ve `calendar.events` kapsamı yoksa reddeder. */
export async function exchangeCode(input: {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  code: string;
  verifier: string;
  fetchImpl?: typeof fetch;
}): Promise<ExchangedTokens> {
  const doFetch = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: redirectUriFor(input.appUrl),
        code_verifier: input.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleOAuthError('GOOGLE_EXCHANGE_FAILED');
  }
  if (!response.ok) throw new GoogleOAuthError('GOOGLE_EXCHANGE_FAILED');
  const data = (await response.json().catch(() => null)) as {
    refresh_token?: unknown;
    access_token?: unknown;
    scope?: unknown;
  } | null;
  if (typeof data?.access_token !== 'string') throw new GoogleOAuthError('GOOGLE_EXCHANGE_FAILED');
  if (typeof data.refresh_token !== 'string' || data.refresh_token === '')
    throw new GoogleOAuthError('GOOGLE_NO_REFRESH_TOKEN');
  const scope = typeof data.scope === 'string' ? data.scope : '';
  if (!scope.split(' ').includes(GOOGLE_CALENDAR_SCOPE))
    throw new GoogleOAuthError('GOOGLE_SCOPE_MISSING');
  return { refreshToken: data.refresh_token, accessToken: data.access_token, scope };
}

/** Görüntü etiketi için birincil takvimin adı (genellikle hesabın e-postası); en iyi çaba, başarısızlık etiketi boş bırakır. */
export async function readCalendarLabel(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=summary',
      { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { summary?: unknown } | null;
    const label = typeof data?.summary === 'string' ? data.summary.trim() : '';
    return label !== '' && label.length <= 200 ? label : null;
  } catch {
    return null;
  }
}

/** Jetonu Google'da geçersiz kılar (bağlantıyı kesince). En iyi çaba: hata sessizdir. */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
