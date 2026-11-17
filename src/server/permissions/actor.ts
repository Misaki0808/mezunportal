import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

import { accountStatusOf, type ActorFacts } from '../rules/authorization';

/** Yetki kararının dayandığı olgular + kimlik. Kişisel alan (e-posta, ad) taşımaz. */
export type Actor = { readonly userId: string; readonly facts: ActorFacts };

export type ActorReader = Pick<
  Prisma.TransactionClient,
  'user' | 'membership' | 'adminGrant' | 'mentorProfile'
>;

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
  const memberships = await db.membership.findMany({
    where: { userId, endedAt: null },
    select: { id: true, departmentId: true, role: true, verificationStatus: true, endedAt: true },
  });
  const grants = await db.adminGrant.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, scope: true, facultyId: true, departmentId: true, revokedAt: true },
  });
  const mentor = await db.mentorProfile.findUnique({
    where: { userId },
    select: { isActive: true },
  });
  return {
    userId: user.id,
    facts: { accountStatus: accountStatusOf(user, now), memberships, grants, mentor },
  };
}
