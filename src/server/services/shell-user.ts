import 'server-only';

import type { ShellStanding, ShellUser } from '@/contracts/shell-user';
import type { PrismaClient } from '@/generated/prisma/client';

import { computeClassStanding } from '../rules/classYear';

type MembershipRow = {
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
  entryYear: number | null;
  classOffset: number;
  department: { code: string };
};

/** Üyelik satırını kartın alt satırına çevirir. Sınıf saklanmaz, kural dosyası hesaplar (`rules/classYear`). */
export function shellMembershipOf(
  row: MembershipRow,
  now: Date,
): NonNullable<ShellUser['membership']> {
  const departmentCode = row.department.code;
  if (row.role === 'ALUMNI') return { departmentCode, standing: 'ALUMNI' };
  if (row.role === 'ACADEMIC') return { departmentCode, standing: 'ACADEMIC' };
  const standing = computeClassStanding(
    { entryYear: row.entryYear, classOffset: row.classOffset },
    now,
  );
  if (standing.kind === 'GRADE')
    return { departmentCode, standing: 'GRADE', grade: standing.grade };
  const kind: ShellStanding = standing.kind === 'PREPARATORY' ? 'PREPARATORY' : 'NONE';
  return { departmentCode, standing: kind };
}

/**
 * Yan menü alt kartı için oturumdaki kullanıcının adı ve üyelik satırı. Kullanıcı yok ya da silinmişse `null`.
 * Kart süs bilgidir: çağıran hatayı yutar, sayfa kartsız açılır.
 */
export async function getShellUser(
  deps: { db: PrismaClient; now?: () => Date },
  userId: string,
): Promise<ShellUser | null> {
  const user = await deps.db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      deletedAt: true,
      memberships: {
        where: { endedAt: null, verificationStatus: 'VERIFIED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          role: true,
          entryYear: true,
          classOffset: true,
          department: { select: { code: true } },
        },
      },
    },
  });
  if (!user || user.deletedAt) return null;
  const row = user.memberships[0];
  return {
    name: user.name,
    membership: row ? shellMembershipOf(row, (deps.now ?? (() => new Date()))()) : null,
  };
}
