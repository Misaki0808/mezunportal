import { isCodedError } from '@/lib/errors';
import { getStorage } from '@/server/external/storage';
import { getDb } from '@/server/db';
import { getSessionUserId } from '@/server/permissions/session';
import { readGraduationDocumentFile } from '@/server/services/graduation-document';
import { logUnexpected } from '@/server/unexpected-log';

// Mezun belgesi dosyası YALNIZ bu yetki kontrollü rotadan akıtılır: oturum + belgenin bölümünü kapsayan
// doğrulanmış yönetici. Başvuran kendi belgesini görmez. Karar verilmiş belgenin dosyası yoktur (404).
export const dynamic = 'force-dynamic';

const HEADERS = {
  'content-type': 'application/pdf',
  'content-disposition': 'inline; filename="mezun-belgesi.pdf"',
  'x-content-type-options': 'nosniff',
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  // PDF görüntülemede kısıtlı içerik politikası (betik, gömme ve dış kaynak yok).
  'content-security-policy': "default-src 'none'; sandbox",
} as const;

const status = (code: number) =>
  new Response(null, { status: code, headers: { 'cache-control': 'no-store' } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const adminUserId = await getSessionUserId();
  if (!adminUserId) return status(401);

  try {
    const bytes = await readGraduationDocumentFile(
      { db: getDb(), storage: getStorage() },
      adminUserId,
      id,
    );
    return new Response(Buffer.from(bytes), { status: 200, headers: HEADERS });
  } catch (error) {
    if (isCodedError(error) && error.kind === 'unauthenticated') return status(401);
    // Yetkisiz, askıda, doğrulanmamış, olmayan belge, karar verilmiş: ayırt edilmez (404).
    logUnexpected('route', 'mezunBelgesiDosya', error);
    return status(404);
  }
}
