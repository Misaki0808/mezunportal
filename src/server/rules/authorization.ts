/**
 * Yetki kararı: SAF işlevler (veritabanı, oturum, saat yok). `docs/security.md` “Yetkilendirme”
 * matrisinin tek uygulaması burasıdır; `src/server/permissions` yalnız olguları yükler ve buraya sorar.
 *
 * İlkeler (fail-closed):
 *  - Kimlik ve rol istemciden gelmez; olgular sunucuda, oturumdaki kullanıcıdan yüklenir.
 *  - Silinmiş hesap “oturumsuz” sayılır (varlığı sızdırılmaz); askıdaki hesap hiçbir şeye erişemez.
 *  - Üyelik ETKİN (`endedAt` boş) ve DOĞRULANMIŞ olmalıdır; bekleyen, reddedilen ve kapanan üyelik sayılmaz.
 *  - Yönetici yetkisi üyelik yerine geçmez ve yalnız doğrulanmış üyeye işler; kapsam aşağıyı kapsar
 *    (sistem ⊃ fakülte ⊃ bölüm), yukarıyı ve yanı kapsamaz.
 *  - Kapsam alanı eksik/bozuk bir yetki hiçbir şeyi kapsamaz.
 */

export type MembershipRoleName = 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
export type VerificationStatusName = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type AdminScopeName = 'SYSTEM' | 'FACULTY' | 'DEPARTMENT';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type UserAccountFacts = {
  banned: boolean;
  banExpires: Date | null;
  deletedAt: Date | null;
};

export type MembershipFacts = {
  id: string;
  departmentId: string;
  role: MembershipRoleName;
  verificationStatus: VerificationStatusName;
  endedAt: Date | null;
};

export type GrantFacts = {
  id: string;
  scope: AdminScopeName;
  facultyId: string | null;
  departmentId: string | null;
  revokedAt: Date | null;
};

export type MentorFacts = { isActive: boolean };

export type ActorFacts = {
  accountStatus: AccountStatus;
  memberships: readonly MembershipFacts[];
  grants: readonly GrantFacts[];
  mentor: MentorFacts | null;
};

/** Bölümün kapsam zinciri (bölüm → fakülte → üniversite). */
export type DepartmentScope = { departmentId: string; facultyId: string; universityId: string };

export type AdminTarget =
  | { kind: 'SYSTEM' }
  | { kind: 'FACULTY'; facultyId: string }
  | { kind: 'DEPARTMENT'; department: DepartmentScope };

/** Matristeki eylemler. Yönetici eylemleri hedef kapsamı taşır. */
export type AccessRequest =
  | {
      action: 'selfProfile' | 'experienceWrite' | 'contentRead' | 'directoryUse' | 'mentorAct';
    }
  | { action: 'adminScope'; target: AdminTarget };

export type DenyReason = 'UNAUTHENTICATED' | 'SUSPENDED' | 'NOT_VERIFIED' | 'FORBIDDEN';
export type AccessDecision = { allowed: true } | { allowed: false; reason: DenyReason };

const ALLOW: AccessDecision = { allowed: true };
const deny = (reason: DenyReason): AccessDecision => ({ allowed: false, reason });

/** Silinmiş > askıda > etkin. Süresi dolmuş askı (`banExpires` geçmiş) kalkmış sayılır. */
export function accountStatusOf(user: UserAccountFacts, now: Date): AccountStatus {
  if (user.deletedAt !== null) return 'DELETED';
  if (user.banned && (user.banExpires === null || user.banExpires.getTime() > now.getTime())) {
    return 'SUSPENDED';
  }
  return 'ACTIVE';
}

export function isActiveMembership(membership: MembershipFacts): boolean {
  return membership.endedAt === null;
}

export function isVerifiedActiveMembership(membership: MembershipFacts): boolean {
  return isActiveMembership(membership) && membership.verificationStatus === 'VERIFIED';
}

export function hasVerifiedMembership(facts: ActorFacts): boolean {
  return facts.memberships.some(isVerifiedActiveMembership);
}

export function isActiveGrant(grant: GrantFacts): boolean {
  return grant.revokedAt === null;
}

/** Tek bir yetki hedefi kapsıyor mu? (Kapsam aşağıyı kapsar; eksik alan hiçbir şeyi kapsamaz.) */
export function grantCovers(grant: GrantFacts, target: AdminTarget): boolean {
  if (!isActiveGrant(grant)) return false;
  switch (grant.scope) {
    case 'SYSTEM':
      return true;
    case 'FACULTY':
      if (grant.facultyId === null) return false;
      if (target.kind === 'FACULTY') return grant.facultyId === target.facultyId;
      if (target.kind === 'DEPARTMENT') return grant.facultyId === target.department.facultyId;
      return false;
    case 'DEPARTMENT':
      if (grant.departmentId === null) return false;
      return target.kind === 'DEPARTMENT' && grant.departmentId === target.department.departmentId;
  }
}

export function adminCovers(facts: ActorFacts, target: AdminTarget): boolean {
  return facts.grants.some((grant) => grantCovers(grant, target));
}

/**
 * Kullanıcının yönetebildiği kapsamın özeti (kuyruk/liste süzgeci için): sistem yöneticisi her şeyi,
 * fakülte yöneticisi fakültelerini, bölüm yöneticisi bölümlerini görür.
 */
export type ManagedScope = {
  system: boolean;
  facultyIds: readonly string[];
  departmentIds: readonly string[];
};

export function describeManagedScope(grants: readonly GrantFacts[]): ManagedScope {
  const active = grants.filter(isActiveGrant);
  const unique = (values: readonly (string | null)[]) => [
    ...new Set(values.filter((value): value is string => value !== null)),
  ];
  return {
    system: active.some((grant) => grant.scope === 'SYSTEM'),
    facultyIds: unique(active.filter((grant) => grant.scope === 'FACULTY').map((g) => g.facultyId)),
    departmentIds: unique(
      active.filter((grant) => grant.scope === 'DEPARTMENT').map((g) => g.departmentId),
    ),
  };
}

export function evaluateAccess(facts: ActorFacts | null, request: AccessRequest): AccessDecision {
  if (facts === null || facts.accountStatus === 'DELETED') return deny('UNAUTHENTICATED');
  if (facts.accountStatus === 'SUSPENDED') return deny('SUSPENDED');

  switch (request.action) {
    case 'selfProfile':
      // Kendi profili, CV ve görünürlük: doğrulanmamış üye de yapabilir.
      return ALLOW;

    case 'experienceWrite':
    case 'contentRead':
    case 'directoryUse':
      return hasVerifiedMembership(facts) ? ALLOW : deny('NOT_VERIFIED');

    case 'mentorAct':
      if (!hasVerifiedMembership(facts)) return deny('NOT_VERIFIED');
      return facts.mentor?.isActive === true ? ALLOW : deny('FORBIDDEN');

    case 'adminScope':
      // Önce yetki var mı (yetkisiz kullanıcıya doğrulama durumu hakkında ipucu verilmez).
      if (!adminCovers(facts, request.target)) return deny('FORBIDDEN');
      return hasVerifiedMembership(facts) ? ALLOW : deny('NOT_VERIFIED');
  }
}
