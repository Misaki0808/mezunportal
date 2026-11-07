import { academicYearStartOf } from './classYear';
import type { MembershipRoleName, VerificationStatusName } from './authorization';

/**
 * Rol geçişi planı (öğrenci → mezun). Saf kural: etkin üyelikleri ve mezuniyet yılını alır, ne yapılacağını
 * söyler. Veritabanı işini `services/membership.ts` yapar.
 *
 * Geçiş EKLER ve KAPATIR, hiçbir şeyi silmez: eski `STUDENT` satırı `endedAt` ile kapanır, `ALUMNI`
 * satırı eklenir/doğrulanır. Böylece geçmiş korunur; içerik ve puan `userId`'ye bağlı olduğundan geçişten
 * etkilenmez (docs/data.md).
 */

export type TransitionMembership = {
  id: string;
  role: MembershipRoleName;
  verificationStatus: VerificationStatusName;
  entryYear: number | null;
  endedAt: Date | null;
};

export type AlumniTransitionInput = { graduationYear: number };

export type TransitionInvalidReason =
  | 'NO_ACTIVE_STUDENT'
  | 'STUDENT_NOT_VERIFIED'
  | 'GRADUATION_YEAR_INVALID'
  | 'GRADUATION_BEFORE_ENTRY'
  | 'GRADUATION_TOO_FAR';

export type AlumniTransitionPlan =
  | { outcome: 'INVALID'; reason: TransitionInvalidReason }
  /** Geçiş zaten yapılmış (etkin doğrulanmış mezun üyeliği var, etkin öğrenci üyeliği yok): işlem yapılmaz. */
  | { outcome: 'ALREADY_TRANSITIONED'; alumniMembershipId: string }
  | {
      outcome: 'TRANSITION';
      endStudentMembershipId: string;
      entryYear: number | null;
      alumni:
        | { action: 'CREATE' }
        /** Belge akışında bekleyen mezun üyeliği doğrulanır. */
        | { action: 'VERIFY_PENDING'; membershipId: string }
        /** Tutarsız yarım kalmış durum: mezun üyeliği zaten doğrulanmış, yalnız öğrenci üyeliği kapanır. */
        | { action: 'KEEP_VERIFIED'; membershipId: string };
    };

/** Mezuniyet yılı en fazla bir yıl sonrası olabilir (yaz dönemi işlemleri için). */
export const MAX_GRADUATION_YEARS_AHEAD = 1;

export function planAlumniTransition(
  memberships: readonly TransitionMembership[],
  input: AlumniTransitionInput,
  now: Date,
): AlumniTransitionPlan {
  const active = memberships.filter((membership) => membership.endedAt === null);
  const student = active.find((membership) => membership.role === 'STUDENT');
  const alumni = active.find((membership) => membership.role === 'ALUMNI');

  if (!student) {
    if (alumni?.verificationStatus === 'VERIFIED') {
      return { outcome: 'ALREADY_TRANSITIONED', alumniMembershipId: alumni.id };
    }
    return { outcome: 'INVALID', reason: 'NO_ACTIVE_STUDENT' };
  }
  if (student.verificationStatus !== 'VERIFIED') {
    return { outcome: 'INVALID', reason: 'STUDENT_NOT_VERIFIED' };
  }

  const { graduationYear } = input;
  if (!Number.isInteger(graduationYear) || graduationYear < 1950) {
    return { outcome: 'INVALID', reason: 'GRADUATION_YEAR_INVALID' };
  }
  if (student.entryYear !== null && graduationYear < student.entryYear) {
    return { outcome: 'INVALID', reason: 'GRADUATION_BEFORE_ENTRY' };
  }
  // Akademik yıl 2026-27 ise “bu yıl” 2027'de biter: üst sınır akademik yılın başlangıcı + 1 + izin.
  const latest = academicYearStartOf(now) + 1 + MAX_GRADUATION_YEARS_AHEAD;
  if (graduationYear > latest) {
    return { outcome: 'INVALID', reason: 'GRADUATION_TOO_FAR' };
  }

  const base = {
    outcome: 'TRANSITION' as const,
    endStudentMembershipId: student.id,
    entryYear: student.entryYear,
  };
  if (!alumni) return { ...base, alumni: { action: 'CREATE' } };
  if (alumni.verificationStatus === 'VERIFIED') {
    return { ...base, alumni: { action: 'KEEP_VERIFIED', membershipId: alumni.id } };
  }
  return { ...base, alumni: { action: 'VERIFY_PENDING', membershipId: alumni.id } };
}
