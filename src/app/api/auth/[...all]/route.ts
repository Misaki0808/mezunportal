import { getAuth } from '@/server/auth';
import { mapAuthResponse } from '@/server/auth/responses';
import { isAllowedAuthRoute } from '@/server/rules/authRoutePolicy';

// Better Auth HTTP yüzeyi BEYAZ LİSTEDEDİR: yalnız e-postadaki/sağlayıcıdaki bağlantıya tıklamayla
// tetiklenen GET uçları açıktır; admin (impersonation dahil), doğrudan giriş/kayıt/parola ve oturum
// uçlarının hepsi 404 verir (src/server/rules/authRoutePolicy.ts). Giriş, e-posta değiştirme ve çıkış
// sunucu eylemlerinden geçer.
export const dynamic = 'force-dynamic';

const NOT_FOUND = () =>
  new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!isAllowedAuthRoute(pathname, request.method)) return NOT_FOUND();
  const response = await getAuth().handler(request);
  return mapAuthResponse(response, pathname);
}

export const POST = NOT_FOUND;
export const PUT = NOT_FOUND;
export const PATCH = NOT_FOUND;
export const DELETE = NOT_FOUND;
