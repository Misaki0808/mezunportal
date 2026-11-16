import { z } from 'zod';

const INVALID = 'VALIDATION_INVALID';

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_PIXELS = 24_000_000;
export const photoCropSchema = z
  .object({
    x: z
      .number({ error: INVALID })
      .min(0, { error: INVALID })
      .max(1, { error: INVALID })
      .default(0.5),
    y: z
      .number({ error: INVALID })
      .min(0, { error: INVALID })
      .max(1, { error: INVALID })
      .default(0.5),
    zoom: z
      .number({ error: INVALID })
      .min(1, { error: INVALID })
      .max(3, { error: INVALID })
      .default(1),
  })
  .strict();
export type PhotoCrop = z.infer<typeof photoCropSchema>;
export const removeProfilePhotoSchema = z
  .object({
    userId: z.string({ error: INVALID }).min(1, { error: INVALID }).max(64, { error: INVALID }),
    reason: z
      .string({ error: INVALID })
      .trim()
      .min(3, { error: INVALID })
      .max(1000, { error: INVALID }),
  })
  .strict();

/** Yalnız kimliği zaten açık olan kişi kartlarında kullanılır; anonim karttan kimlik türetilmez. */
export function profilePhotoHref(userId: string, size: 96 | 512 = 96): string {
  return `/api/profil-fotografi/${encodeURIComponent(userId)}?size=${size}`;
}
