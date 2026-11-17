import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

import { accountStatusOf, type ActorFacts } from '../rules/authorization';

/** Yetki kararının dayandığı olgular + kimlik. Kişisel alan (e-posta, ad) taşımaz. */
export type Actor = { readonly userId: string; readonly facts: ActorFacts };

export type ActorReader = Pick<Prisma.TransactionClient, 'user'>;

/**
 * Kullanıcının hesap durumunu, ETKİN üyeliklerini, ETKİN yönetici yetkilerini ve mentor profilini
 * sırayla yükler. Bir işlem istemcisinde ilişkileri paralel sorgulamak pg uyarısına yol açar.
 * Kullanıcı yoksa `null` (oturumsuz ile aynı muamele).
 */
export async function loadActor(db: ActorReader, userId: string, now: Date): Promise<Actor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, banned: true, banExpires: true, deletedAt: true },
  });
  if (!user) return null;
  const memberships = await db.user.findUnique({
    where: { id: userId },
    select: {
      memberships: {
        where: { endedAt: null },
        select: {
          id: true,
          departmentId: true,
          role: true,
          verificationStatus: true,
          endedAt: true,
        },
      },
    },
  });
  const grants = await db.user.findUnique({
    where: { id: userId },
    select: {
      adminGrants: {
        where: { revokedAt: null },
        select: { id: true, scope: true, facultyId: true, departmentId: true, revokedAt: true },
      },
    },
  });
  const mentor = await db.user.findUnique({
    where: { id: userId },
    select: { mentorProfile: { select: { isActive: true } } },
  });
  if (!memberships || !grants || !mentor) return null;

  return {
    userId: user.id,
    facts: {
      accountStatus: accountStatusOf(user, now),
      memberships: memberships.memberships,
      grants: grants.adminGrants,
      mentor: mentor.mentorProfile,
    },
  };
}
