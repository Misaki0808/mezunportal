import type { MembershipRoleName } from './authorization';

/**
 * Üyelik düzeltme planı (saf; `ROLE_CORRECT`). Yanlış beyanı düzeltir: bölüm ya da rol değişirse eski üyelik
 * KAPANIR ve yöneticice doğrulanmış (`ADMIN` yöntemi) yeni üyelik açılır (geçmiş korunur); yalnız yıl değişirse
 * satır yerinde güncellenir. Rol ile yıl uyumu veritabanı kısıtıyla aynıdır (`Membership_years_check`):
 * giriş yılı öğrenciye (mezunda isteğe bağlı), mezuniyet yılı yalnız mezuna aittir; akademisyende ikisi de boştur.
 */

export const MEMBERSHIP_YEAR_MIN = 1950;
export const MEMBERSHIP_YEAR_MAX = 2100;

export type CorrectableMembership = {
  departmentId: string;
  role: MembershipRoleName;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  endedAt: Date | null;
  entryYear: number | null;
  graduationYear: number | null;
  classOffset: number;
};

export type MembershipChanges = {
  departmentId?: string;
  role?: MembershipRoleName;
  /** `undefined`: değiştirme · `null`: temizle · sayı: yeni değer. */
  entryYear?: number | null;
  graduationYear?: number | null;
};

export type CorrectionProblem =
  | 'NOT_ACTIVE'
  | 'NOT_VERIFIED'
  | 'NO_CHANGE'
  | 'ENTRY_YEAR_REQUIRED'
  | 'GRADUATION_YEAR_REQUIRED'
  | 'YEAR_NOT_ALLOWED'
  | 'YEAR_RANGE'
  | 'YEAR_ORDER';

export type NextMembershipValues = {
  departmentId: string;
  role: MembershipRoleName;
  entryYear: number | null;
  graduationYear: number | null;
  classOffset: number;
};

export type CorrectionPlan =
  | { outcome: 'INVALID'; problem: CorrectionProblem }
  /** Satır yerinde güncellenir (yalnız yıllar). */
  | { outcome: 'IN_PLACE'; next: NextMembershipValues }
  /** Eski satır kapanır, `next` değerleriyle yeni doğrulanmış satır açılır. */
  | { outcome: 'REPLACE'; next: NextMembershipValues };

const invalid = (problem: CorrectionProblem): CorrectionPlan => ({ outcome: 'INVALID', problem });
const inRange = (year: number) =>
  Number.isInteger(year) && year >= MEMBERSHIP_YEAR_MIN && year <= MEMBERSHIP_YEAR_MAX;

export function planMembershipCorrection(
  current: CorrectableMembership,
  changes: MembershipChanges,
): CorrectionPlan {
  if (current.endedAt !== null) return invalid('NOT_ACTIVE');
  // Bekleyen/reddedilen üyeliğin kendi akışı vardır (belge onayı/ret); düzeltme yalnız doğrulanmışa uygulanır.
  if (current.verificationStatus !== 'VERIFIED') return invalid('NOT_VERIFIED');

  const role = changes.role ?? current.role;
  const departmentId = changes.departmentId ?? current.departmentId;
  const roleOrDepartmentChanged = role !== current.role || departmentId !== current.departmentId;

  let entryYear = changes.entryYear !== undefined ? changes.entryYear : current.entryYear;
  let graduationYear =
    changes.graduationYear !== undefined ? changes.graduationYear : current.graduationYear;

  // Yeni role ait olmayan yıl, AÇIKÇA verilmediyse sessizce temizlenir; açıkça verildiyse hatadır.
  if (role === 'ACADEMIC') {
    if (changes.entryYear != null || changes.graduationYear != null) {
      return invalid('YEAR_NOT_ALLOWED');
    }
    entryYear = null;
    graduationYear = null;
  }
  if (role !== 'ALUMNI') {
    if (changes.graduationYear != null) return invalid('YEAR_NOT_ALLOWED');
    graduationYear = null;
  }
  if (role === 'STUDENT' && entryYear === null) return invalid('ENTRY_YEAR_REQUIRED');
  if (role === 'ALUMNI' && graduationYear === null) return invalid('GRADUATION_YEAR_REQUIRED');

  if (
    (entryYear !== null && !inRange(entryYear)) ||
    (graduationYear !== null && !inRange(graduationYear))
  ) {
    return invalid('YEAR_RANGE');
  }
  if (entryYear !== null && graduationYear !== null && graduationYear < entryYear) {
    return invalid('YEAR_ORDER');
  }

  // Öğrenci aynı bölümde öğrenci kalıyorsa hazırlık/uzatma düzeltmesi korunur; başka her durumda sıfırlanır.
  const keepOffset = role === 'STUDENT' && current.role === 'STUDENT';
  const next: NextMembershipValues = {
    departmentId,
    role,
    entryYear,
    graduationYear,
    classOffset: keepOffset ? current.classOffset : 0,
  };

  if (roleOrDepartmentChanged) return { outcome: 'REPLACE', next };
  if (entryYear === current.entryYear && graduationYear === current.graduationYear) {
    return invalid('NO_CHANGE');
  }
  return { outcome: 'IN_PLACE', next };
}

/**
 * Son sistem yöneticisi koruması (saf): kaldırılacak yetki dışında, silinmemiş kullanıcıya ait etkin bir SİSTEM
 * yetkisi kalmıyorsa kaldırma reddedilir.
 */
export function wouldRemoveLastSystemGrant(
  activeSystemGrants: readonly { grantId: string; userDeleted: boolean }[],
  targetGrantId: string,
): boolean {
  return !activeSystemGrants.some((grant) => grant.grantId !== targetGrantId && !grant.userDeleted);
}
