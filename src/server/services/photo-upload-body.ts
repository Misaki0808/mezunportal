import 'server-only';
import { PROFILE_PHOTO_MAX_BYTES } from '@/contracts/profile-photo';
import { codedValidation } from '@/lib/errors';
/** FormData ayrıştırıcısından önce gerçek akış boyutu sınırlanır (Content-Length'e güvenilmez). */
export async function boundedPhotoForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw codedValidation('PHOTO_INVALID');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > PROFILE_PHOTO_MAX_BYTES + 16_384) {
        await reader.cancel();
        throw codedValidation('PHOTO_TOO_LARGE');
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    throw codedValidation('PHOTO_INVALID');
  }
}
