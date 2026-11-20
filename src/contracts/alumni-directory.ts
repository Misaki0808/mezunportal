import { idTextSchema } from '@/lib/id-text';
import { z } from 'zod';

import { userTextSchema } from '@/lib/user-text';

/** Mezun dizini sayfa boyu; sayfa sayısını istemci de bundan hesaplar. */
export const ALUMNI_PAGE_SIZE = 24;
const text = userTextSchema(2, 100);
export const alumniSearchSchema = z
  .object({
    q: text.optional(),
    sectorId: idTextSchema().optional(),
    company: text.optional(),
    title: text.optional(),
    skill: text.optional(),
    city: text.optional(),
    graduationFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    graduationTo: z.coerce.number().int().min(1900).max(2100).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict()
  .refine((v) => !v.graduationFrom || !v.graduationTo || v.graduationFrom <= v.graduationTo);
export type AlumniSearch = z.infer<typeof alumniSearchSchema>;
export const alumniVisibilitySchema = z.object({ visible: z.boolean() }).strict();
export type AlumniVisibilityInput = z.input<typeof alumniVisibilitySchema>;
export type AlumniCard = {
  userId: string;
  name: string;
  position: { company: string; title: string; sector: string | null } | null;
  graduationYear: number | null;
};
export type AlumniPage = { items: AlumniCard[]; page: number; total: number; hasMore: boolean };
