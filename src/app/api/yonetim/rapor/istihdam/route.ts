import {
  EMPLOYMENT_EXPORT_CONTENT_TYPE,
  employmentReportFilterSchema,
  type EmploymentReportFilter,
} from '@/contracts/admin';
import { isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { getSessionUserId } from '@/server/permissions/session';
import { exportEmploymentReport } from '@/server/services/admin-employment';

// Mezun istihdam raporu (Excel). Yetki kontrollü rotadan akıtılır: oturum + kapsamı olan doğrulanmış yönetici.
// Dosya yalnız toplu sayılar içerir; her dışa aktarma `DATA_EXPORT` işlem kaydı yazar ve hız sınırına tabidir.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const YEAR_KEYS = new Set<string>(['graduationYearFrom', 'graduationYearTo']);

const failure = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store', ...extra } });

/** Sorgu dizgesi → süzgeç. Bilinmeyen anahtar (şema `strict`), tekrar eden anahtar ya da sayı olmayan yıl geçersizdir. */
function parseFilter(url: URL): EmploymentReportFilter | null {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    if (values.length !== 1) return null;
    const value = values[0]!;
    if (value === '') continue;
    raw[key] = YEAR_KEYS.has(key) ? Number(value) : value;
  }
  const parsed = employmentReportFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return failure(401);

  const filter = parseFilter(new URL(request.url));
  if (!filter) return failure(400);

  try {
    const { bytes, fileName } = await exportEmploymentReport({ db: getDb() }, userId, filter);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'content-type': EMPLOYMENT_EXPORT_CONTENT_TYPE,
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
      // Askıda, doğrulanmamış, yetkisiz: ayırt edilmez.
      return failure(403);
    }
    return failure(500);
  }
}
