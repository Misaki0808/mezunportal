import { boundedPhotoForm } from '@/server/services/photo-upload-body';
import { photoCropSchema } from '@/contracts/profile-photo';
import { getEnv } from '@/lib/env';
import { isCodedError, codedForbidden, codedValidation } from '@/lib/errors';
import { getDb } from '@/server/db';
import { getStorage } from '@/server/external/storage';
import { requireUser } from '@/server/permissions';
import { uploadProfilePhoto } from '@/server/services/profile-photo';
import { logUnexpected } from '@/server/unexpected-log';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    // Multipart çapraz kökenli gönderilebilir: çerez tek başına CSRF koruması değildir.
    if (request.headers.get('origin') !== new URL(getEnv().APP_URL).origin)
      throw codedForbidden('AUTH_FORBIDDEN');
    const form = await boundedPhotoForm(request);
    const file = form.get('file');
    if (!(file instanceof File) || form.get('consent') !== 'true')
      throw codedValidation('VALIDATION_INVALID');
    const crop = photoCropSchema.safeParse({
      x: Number(form.get('x') ?? 0.5),
      y: Number(form.get('y') ?? 0.5),
      zoom: Number(form.get('zoom') ?? 1),
    });
    if (!crop.success) throw codedValidation('VALIDATION_INVALID');
    const result = await uploadProfilePhoto({ db: getDb(), storage: getStorage() }, actor.userId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      crop: crop.data,
      consentVersion: String(form.get('consentVersion') ?? ''),
    });
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (isCodedError(error))
      return Response.json(
        { errorCode: error.code },
        { status: error.status, headers: { 'cache-control': 'no-store' } },
      );
    logUnexpected('route', 'profilFotografiYukle', error);
    return Response.json(
      { errorCode: 'SERVER_UNEXPECTED' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
