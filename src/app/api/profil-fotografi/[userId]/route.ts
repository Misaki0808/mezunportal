import { getDb } from '@/server/db';
import { getStorage } from '@/server/external/storage';
import { readRouteSession } from '@/server/permissions/route-session';
import { readProfilePhoto } from '@/server/services/profile-photo';
import { logUnexpected } from '@/server/unexpected-log';
import { isCodedError } from '@/lib/errors';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await readRouteSession('profilFotografi');
  const headers = {
    'cache-control': 'private, no-store',
    vary: 'Cookie',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  if (!session.ok)
    return new Response(null, { status: session.response.status === 503 ? 503 : 404, headers });
  try {
    const { userId } = await context.params;
    const size = new URL(request.url).searchParams.get('size');
    if (!userId || userId.length > 64 || (size !== null && size !== '96' && size !== '512'))
      return new Response(null, { status: 404, headers });
    const bytes = await readProfilePhoto(
      { db: getDb(), storage: getStorage() },
      session.userId,
      userId,
      size === '512' ? 512 : 96,
    );
    return new Response(Buffer.from(bytes), {
      headers: {
        ...headers,
        'content-type': 'image/webp',
        'content-disposition': 'inline; filename="profil.webp"',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    logUnexpected('route', 'profilFotografi', error);
    const hidden =
      isCodedError(error) &&
      (error.code === 'RESOURCE_NOT_FOUND' ||
        error.code === 'CONSENT_REQUIRED' ||
        error.code.startsWith('AUTH_'));
    return new Response(null, { status: hidden ? 404 : 503, headers });
  }
}
