import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

/**
 * Listelenme şartı (kart 572): mezun/akademisyen mentor etkin profiliyle listelenir; ÖĞRENCİ mentor (3. sınıf ve üstü kendiliğinden
 * mentordur) en az bir müsaitlik kuralı ekleyene dek listelenmez, otomatik açılan boş profiller dizini doldurmasın. Dizin, randevu,
 * CV incelemesi girişi, şirket sayfası ve ana sayfa sayacı aynı şartı kullanır.
 */
export const listedMentorUser: Prisma.UserWhereInput = {
  OR: [
    {
      memberships: {
        some: {
          endedAt: null,
          verificationStatus: 'VERIFIED',
          role: { in: ['ALUMNI', 'ACADEMIC'] },
        },
      },
    },
    { availabilityRules: { some: {} } },
  ],
};
