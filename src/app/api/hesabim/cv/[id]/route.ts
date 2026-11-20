import { unstable_rethrow } from 'next/navigation';
import { codedForbidden, codedNotFound, isCodedError } from '@/lib/errors';
import { getDb } from '@/server/db';
import { getStorage } from '@/server/external/storage';
import { requireUserWithoutConsent } from '@/server/permissions';
import { accountStatusOf } from '@/server/rules/authorization';
import { logUnexpected } from '@/server/unexpected-log';

export const dynamic = 'force-dynamic';
const noStore = { 'cache-control': 'no-store' };

/** Dosya yalnız hesabın kendi yüklemesidir; silme ile aynı kullanıcı kilidi altında okunur. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUserWithoutConsent();
    const { id } = await context.params;
    const bytes = await getDb().$transaction(async (tx) => {
      // Silmeyle yarışı önlemek için kilit ve hesap durumu aynı işlemde; yarış testi henüz yok.
      // Depolama uzak sürücüye taşınırsa okumayı işlem dışına al: havuz ve 5 sn işlem sınırı.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR SHARE`;
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { banned: true, banExpires: true, deletedAt: true },
      });
      if (!user || user.deletedAt) throw codedNotFound('RESOURCE_NOT_FOUND');
      if (accountStatusOf(user, new Date()) !== 'ACTIVE')
        throw codedForbidden('AUTH_ACCOUNT_SUSPENDED');
      const upload = await tx.cvUpload.findFirst({
        where: { id, userId: actor.userId },
        select: { storageKey: true },
      });
      if (!upload?.storageKey) throw codedNotFound('RESOURCE_NOT_FOUND');
      const file = await getStorage().get(upload.storageKey);
      if (!file) throw codedNotFound('RESOURCE_NOT_FOUND');
      return file;
    });
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        ...noStore,
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="cv.pdf"',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    if (isCodedError(error))
      return Response.json({ errorCode: error.code }, { status: error.status, headers: noStore });
    logUnexpected('route', 'kendiCvIndir', error);
    return Response.json({ errorCode: 'SERVER_UNEXPECTED' }, { status: 500, headers: noStore });
  }
}
