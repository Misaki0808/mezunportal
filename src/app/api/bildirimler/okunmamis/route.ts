import { getDb } from '@/server/db';
import { requireUser } from '@/server/permissions';
import { countMyUnread } from '@/server/services/inbox';

// Rozet sayısı: yalnız OTURUMDAKİ kullanıcının okunmamış bildirim sayısı (üst sınırlı). Oturumsuz: 401. Önbelleğe alınmaz.
// Sunucu eylemi değil GET'tir: gezinme/odak yenilemeleri eylem POST'larına karışmaz.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const actor = await requireUser().catch(() => null);
  if (!actor) return new Response(null, { status: 401, headers: { 'cache-control': 'no-store' } });
  const unread = await countMyUnread({ db: getDb() }, actor.userId);
  return Response.json({ unread }, { headers: { 'cache-control': 'private, no-store' } });
}
