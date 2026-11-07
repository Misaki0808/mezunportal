import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

import {
  describeManagedScope,
  evaluateAccess,
  type ActorFacts,
  type DepartmentScope,
} from '../rules/authorization';

export type ScopeReader = Pick<Prisma.TransactionClient, 'department'>;

/**
 * Kapsam çözümleme: bölüm → fakülte → üniversite. Bölüm yoksa `null`; çağıranlar bunu “yetkisiz”
 * sayar (var olmayan kimliği yetkisizden ayırt etmeyen tek bir yanıt).
 */
export async function resolveDepartmentScope(
  db: ScopeReader,
  departmentId: string,
): Promise<DepartmentScope | null> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true, facultyId: true, faculty: { select: { universityId: true } } },
  });
  if (!department) return null;
  return {
    departmentId: department.id,
    facultyId: department.facultyId,
    universityId: department.faculty.universityId,
  };
}

/**
 * Yöneticinin yönetebildiği bölüm kimlikleri (kuyruk/liste süzgeci: “moderatör yalnız kendi kapsamını
 * görür”). Hesap etkin ve üyelik doğrulanmış değilse boş döner.
 */
export async function listManagedDepartmentIds(
  db: ScopeReader,
  facts: ActorFacts,
): Promise<string[]> {
  // Üyelik/hesap koşulları için kapsam-bağımsız bir yönetici sorusu: SYSTEM hedefi yalnız SYSTEM yetkisi
  // taşıyanı geçirir, bu yüzden hesap/üyelik durumunu `selfProfile` + doğrulama ile ayrı sınarız.
  if (!evaluateAccess(facts, { action: 'directoryUse' }).allowed) return [];

  const scope = describeManagedScope(facts.grants);
  if (scope.system) {
    const all = await db.department.findMany({ select: { id: true } });
    return all.map((department) => department.id);
  }
  if (scope.facultyIds.length === 0 && scope.departmentIds.length === 0) return [];

  const rows = await db.department.findMany({
    where: {
      OR: [
        ...(scope.facultyIds.length > 0 ? [{ facultyId: { in: [...scope.facultyIds] } }] : []),
        ...(scope.departmentIds.length > 0 ? [{ id: { in: [...scope.departmentIds] } }] : []),
      ],
    },
    select: { id: true },
  });
  return rows.map((department) => department.id);
}
