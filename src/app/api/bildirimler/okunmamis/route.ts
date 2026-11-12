import { getDb } from '@/server/db';
import { requireUserWithoutConsent } from '@/server/permissions';
import { countMyUnread } from '@/server/services/inbox';
import { requireConsent } from '@/server/services/privacy';

// Rozet sayısı: yalnız OTURUMDAKİ kullanıcının okunmamış bildirim sayısı (üst sınırlı). Oturumsuz: 401. Önbelleğe alınmaz.
// Sunucu eylemi değil GET'tir: gezinme/odak yenilemeleri eylem POST'larına karışmaz.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const actor = await requireUserWithoutConsent().catch(() => null);
  if (!actor) return new Response(null, { status: 401, headers: { 'cache-control': 'no-store' } });
  // Oturum açık ama güncel zorunlu onay yok (örn. /onay ekranı): 0 döner, 401 değil. Zil bu ekranlarda da yenilenir ve 4xx yanıt
  // tarayıcı konsoluna hata olarak düşer. Onay verilene kadar bildirim sayısı da gösterilmez.
  const consented = await requireConsent(getDb(), actor.userId).then(
    () => true,
    () => false,
  );
  if (!consented) {
    return Response.json({ unread: 0 }, { headers: { 'cache-control': 'private, no-store' } });
  }
  const unread = await countMyUnread({ db: getDb() }, actor.userId);
  return Response.json({ unread }, { headers: { 'cache-control': 'private, no-store' } });
}
