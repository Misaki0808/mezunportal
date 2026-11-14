import { getDb } from '@/server/db';
import { getStorage } from '@/server/external/storage';
import { readRouteSession } from '@/server/permissions/route-session';
import { readFile } from '@/server/services/cv-review-request';
import { logUnexpected } from '@/server/unexpected-log';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readRouteSession('cvIncelemeDosya');
  if (!session.ok) return session.response;
  const userId = session.userId;
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
  } catch (error) {
    logUnexpected('route', 'cvIncelemeDosya', error);
    return new Response(null, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
}
