/**
 * Olayın sahibi: kullanıcının O ANKİ birincil doğrulanmış üyeliği (rol + bölüm). Birden çok üyelik varsa akademisyen >
 * mezun > öğrenci, eşitlikte küçük bölüm kimliği (deterministik). Doğrulanmış etkin üyelik yoksa `null`: olay yine yazılır,
 * rol ve bölüm boştur (yalnız sistem yöneticisi bölümsüz olayları görür).
 */
export type MembershipFacts = {
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
  departmentId: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  endedAt: Date | null;
};
export type EventSubject = { role: MembershipFacts['role']; departmentId: string };

const PRIORITY: Record<MembershipFacts['role'], number> = { ACADEMIC: 0, ALUMNI: 1, STUDENT: 2 };

export function pickEventSubject(memberships: readonly MembershipFacts[]): EventSubject | null {
  const active = memberships.filter(
    (membership) => membership.verificationStatus === 'VERIFIED' && membership.endedAt === null,
  );
  const [first] = [...active].sort(
    (a, b) =>
      PRIORITY[a.role] - PRIORITY[b.role] ||
      (a.departmentId < b.departmentId ? -1 : a.departmentId > b.departmentId ? 1 : 0),
  );
  return first ? { role: first.role, departmentId: first.departmentId } : null;
}

/** Yukarı yönlü geçilen profil eşikleri (önceki < eşik ≤ yeni). */
export function crossedThresholds(
  before: number,
  after: number,
  thresholds: readonly number[],
): number[] {
  return thresholds.filter((threshold) => before < threshold && after >= threshold);
}
