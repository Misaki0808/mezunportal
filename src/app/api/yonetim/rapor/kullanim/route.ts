import { usageMetricsFilterSchema, type UsageMetricsFilter } from '@/contracts/metrics';
import { isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { readRouteSession } from '@/server/permissions/route-session';
import { exportUsageMetrics } from '@/server/services/usage-metrics';
import { logUnexpected } from '@/server/unexpected-log';

// Kullanım metrikleri (Excel). Yetki kontrollü rota: oturum + kapsamı olan doğrulanmış yönetici. Dosya yalnız toplu sayılar
// içerir; her dışa aktarma `DATA_EXPORT` işlem kaydı yazar ve hız sınırına tabidir.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const failure = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store', ...extra } });

/** Sorgu dizgesi → süzgeç. Bilinmeyen anahtar (şema `strict`), bozuk tarih ya da tekrar eden tekil anahtar geçersizdir. */
function parseFilter(url: URL): UsageMetricsFilter | null {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    if (key === 'types') raw.types = values;
    else if (values.length !== 1) return null;
    else raw[key] = values[0];
  }
  const parsed = usageMetricsFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request) {
  const session = await readRouteSession('raporKullanim');
  if (!session.ok) return session.response;
  const userId = session.userId;
  const filter = parseFilter(new URL(request.url));
  if (!filter) return failure(400);
  try {
    const { bytes, fileName } = await exportUsageMetrics({ db: getDb() }, userId, filter);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fileName}"`,
        'content-length': String(bytes.byteLength),
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (isCodedError(error)) {
      if (error.kind === 'unauthenticated') return failure(401);
      if (error.kind === 'rateLimited') return failure(429, { 'retry-after': '3600' });
      if (error.kind === 'validation') return failure(400);
      return failure(403);
    }
    logUnexpected('route', 'raporKullanim', error);
    return failure(500);
  }
}
