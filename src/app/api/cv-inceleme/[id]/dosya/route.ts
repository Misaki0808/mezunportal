import { getDb } from '@/server/db';
import { getStorage } from '@/server/external/storage';
import { getSessionUserId } from '@/server/permissions/session';
import { readFile } from '@/server/services/cv-review-request';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401, headers: { 'cache-control': 'no-store' } });
  try {
    const { id } = await context.params;
    const bytes = await readFile({ db: getDb(), storage: getStorage() }, userId, id);
    return new Response(Buffer.from(bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="cv.pdf"',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response(null, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
}
