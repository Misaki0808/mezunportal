import 'server-only';

import {
  AUTH_PATHS,
  CHECK_EMAIL_RESPONSE,
  EMAIL_CHANGE_RETURN_PATHS,
  type CheckEmailResponse,
  type DeclareMembershipInput,
  type DeclareMembershipOutput,
  type SelectableDepartmentsOutput,
  type SignInOptions,
  type StartLinkedInSignInOutput,
  type VerificationState,
} from '@/contracts/auth';
import type { PrismaClient } from '@/generated/prisma/client';
import { isLinkedInConfigured, type AuthEnv } from '@/lib/env';
import {
  CodedError,
  codedConflict,
  codedForbidden,
  codedNotFound,
  codedRateLimited,
  codedValidation,
} from '@/lib/errors';
import { safeReturnPath } from '@/lib/return-path';

import { AUTH_LIMITS } from '../auth/limits';
import { logAuthFailure } from '../auth/log';
import { consumeRateLimit, rateLimitKey, type RateLimitResult } from '../auth/rate-limit';
import type { MezunAuth } from '../auth/config';
import type { Actor } from '../permissions/actor';
import { emailKindOf, selfVerifiableRoles } from '../rules/emailDomain';
import { deriveVerificationOverall } from '../rules/verificationState';

export type AuthFlowDeps = {
  db: PrismaClient;
  auth: { api: Pick<MezunAuth['api'], 'signInMagicLink' | 'changeEmail' | 'signInSocial'> };
  env: Pick<AuthEnv, 'BETTER_AUTH_SECRET' | 'LINKEDIN_CLIENT_ID' | 'LINKEDIN_CLIENT_SECRET'>;
  now?: () => Date;
};

const nowOf = (deps: AuthFlowDeps) => (deps.now ?? (() => new Date()))();

async function enforceLimit(
  deps: AuthFlowDeps,
  scope: string,
  value: string,
  rule: (typeof AUTH_LIMITS)[keyof typeof AUTH_LIMITS],
  code: 'RATE_LIMITED' | 'AUTH_IP_RATE_LIMITED' = 'RATE_LIMITED',
): Promise<void> {
  const result: RateLimitResult = await consumeRateLimit(
    deps.db,
    rateLimitKey(scope, value, deps.env.BETTER_AUTH_SECRET),
    rule,
    nowOf(deps),
  );
  if (!result.allowed) {
    throw codedRateLimited(code, { retryAfterSeconds: result.retryAfterSeconds });
  }
}

/** Giriş ekranı hangi yöntemleri gösterecek? LinkedIn anahtarı yoksa kapalı + sebep (devre dışı sebebini yazar). */
export function getSignInOptions(
  env: Pick<AuthEnv, 'LINKEDIN_CLIENT_ID' | 'LINKEDIN_CLIENT_SECRET'>,
): SignInOptions {
  return isLinkedInConfigured(env)
    ? { linkedin: { enabled: true, disabledReason: null } }
    : { linkedin: { enabled: false, disabledReason: 'AUTH_PROVIDER_NOT_CONFIGURED' } };
}

/**
 * E-posta bağlantısı iste. Yanıt, adresin kayıtlı/askıda/silinmiş olmasından BAĞIMSIZ olarak aynıdır:
 * bağlantı üretimi kullanıcı aramaz; hata (e-posta kuyruğu dahil) yutulur ve günlüğe yalnız tür yazılır.
 * Yalnız hız sınırı farklı görünür ve o da adresin durumundan bağımsızdır.
 */
export async function requestSignInLink(
  deps: AuthFlowDeps,
  input: { email: string; headers: Headers; clientIp: string | null; returnTo?: string },
): Promise<CheckEmailResponse> {
  await enforceLimit(deps, 'magic-link:email', input.email, AUTH_LIMITS.magicLinkPerEmail);
  if (input.clientIp) {
    await enforceLimit(
      deps,
      'magic-link:ip',
      input.clientIp,
      AUTH_LIMITS.magicLinkPerIp,
      'AUTH_IP_RATE_LIMITED',
    );
  }
  try {
    await deps.auth.api.signInMagicLink({
      body: {
        email: input.email,
        // Dönüş yolu yalnız site içi (açık yönlendirme yok); güvensizse varsayılan.
        callbackURL: safeReturnPath(input.returnTo) ?? AUTH_PATHS.afterSignIn,
        errorCallbackURL: AUTH_PATHS.signIn,
      },
      headers: input.headers,
    });
  } catch (error) {
    logAuthFailure('requestSignInLink', error);
  }
  return CHECK_EMAIL_RESPONSE;
}

/** LinkedIn ile girişi başlatır; yetkilendirme adresini döner. Hedef yol istemciden alınmaz. */
export async function startLinkedInSignIn(
  deps: AuthFlowDeps,
  input: { headers: Headers; clientIp: string | null },
): Promise<StartLinkedInSignInOutput> {
  if (!isLinkedInConfigured(deps.env)) {
    throw codedForbidden('AUTH_PROVIDER_NOT_CONFIGURED');
  }
  if (input.clientIp) {
    await enforceLimit(deps, 'linkedin-start:ip', input.clientIp, AUTH_LIMITS.linkedInStartPerIp);
  }
  try {
    const result = await deps.auth.api.signInSocial({
      body: {
        provider: 'linkedin',
        callbackURL: AUTH_PATHS.afterSignIn,
        errorCallbackURL: AUTH_PATHS.signIn,
        disableRedirect: true,
      },
      headers: input.headers,
    });
    if (!result.url) throw new Error('Yetkilendirme adresi yok');
    return { redirectUrl: result.url };
  } catch (error) {
    logAuthFailure('startLinkedInSignIn', error);
    throw new CodedError('conflict', 'AUTH_PROVIDER_FAILED');
  }
}

/**
 * E-posta değiştirme isteği (oturum zorunlu — çağıran `requireUser` yapar). Kullanıcının KENDİ mevcut
 * adresi `EMAIL_CHANGE_SAME_ADDRESS` ile reddedilir (kendi adresi, sızıntı değil; tur bulgusu #4). Yeni adres
 * başkasına aitse yanıt yine `CHECK_EMAIL`'dir (kayıt durumu sızmaz). Eski adres onayı
 * `EMAIL_CHANGE_RETURN_PATHS.oldAddressConfirmed`'a döner; yeni adres doğrulaması `completed`'a (config).
 */
export async function requestEmailChange(
  deps: AuthFlowDeps,
  actor: Actor,
  input: { newEmail: string; headers: Headers },
): Promise<CheckEmailResponse> {
  const current = await deps.db.user.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });
  if (current && current.email.trim().toLowerCase() === input.newEmail.trim().toLowerCase()) {
    throw codedValidation('EMAIL_CHANGE_SAME_ADDRESS');
  }
  await enforceLimit(deps, 'email-change:user', actor.userId, AUTH_LIMITS.emailChangePerUser);
  try {
    await deps.auth.api.changeEmail({
      body: {
        newEmail: input.newEmail,
        callbackURL: EMAIL_CHANGE_RETURN_PATHS.oldAddressConfirmed,
      },
      headers: input.headers,
    });
  } catch (error) {
    logAuthFailure('requestEmailChange', error);
  }
  return CHECK_EMAIL_RESPONSE;
}

// ---------------------------------------------------------------------------------------------
// Alan adı ile üyelik beyanı (D2)
// ---------------------------------------------------------------------------------------------

async function loadOwnEmail(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
  if (!user) throw codedNotFound('RESOURCE_NOT_FOUND');
  return user;
}

/**
 * Öğrenci/akademisyen üyeliğini alan adıyla doğrular. Kural, SEÇİLEN bölümün üniversitesinin
 * `University` kaydındaki alan adı listesidir (başka üniversitenin adresi bu bölümü doğrulayamaz);
 * e-posta doğrulanmış olmalıdır. Mezun bu yoldan geçemez. İstemci yalnız rol/bölüm/giriş yılı gönderir.
 */
export async function declareMembership(
  deps: AuthFlowDeps,
  actor: Actor,
  input: Extract<DeclareMembershipInput, { role: 'STUDENT' | 'ACADEMIC' }>,
): Promise<DeclareMembershipOutput> {
  const { db } = deps;
  const now = nowOf(deps);
  const user = await loadOwnEmail(db, actor.userId);
  const department = await db.department.findUnique({
    where: { id: input.departmentId },
    select: {
      id: true,
      faculty: {
        select: { university: { select: { studentEmailDomains: true, staffEmailDomains: true } } },
      },
    },
  });
  if (!department) throw codedNotFound('RESOURCE_NOT_FOUND');

  const allowed = selfVerifiableRoles(user.email, department.faculty.university);
  if (!user.emailVerified || !allowed.includes(input.role)) {
    throw codedForbidden('EMAIL_DOMAIN_NOT_ALLOWED');
  }

  const verified = {
    verificationStatus: 'VERIFIED' as const,
    verificationMethod:
      input.role === 'STUDENT' ? ('STUDENT_EMAIL' as const) : ('STAFF_EMAIL' as const),
    verifiedAt: now,
    verifiedById: null,
    entryYear: input.role === 'STUDENT' ? input.entryYear : null,
    classOffset: 0,
  };

  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Membership"
        WHERE "userId" = ${actor.userId} AND "departmentId" = ${input.departmentId}
        FOR UPDATE`;
      const existing = await tx.membership.findFirst({
        where: {
          userId: actor.userId,
          departmentId: input.departmentId,
          role: input.role,
          endedAt: null,
        },
        select: { id: true, verificationStatus: true },
      });
      if (existing?.verificationStatus === 'VERIFIED') {
        throw codedConflict('MEMBERSHIP_ALREADY_VERIFIED');
      }
      if (existing) {
        await tx.membership.update({ where: { id: existing.id }, data: verified });
        return { membershipId: existing.id, status: 'VERIFIED' as const };
      }
      const created = await tx.membership.create({
        data: {
          userId: actor.userId,
          departmentId: input.departmentId,
          role: input.role,
          ...verified,
        },
        select: { id: true },
      });
      return { membershipId: created.id, status: 'VERIFIED' as const };
    });
  } catch (error) {
    // Eşzamanlı ikinci beyan: etkin üyelik tekilliği (kısmi indeks) ihlali.
    if ((error as { code?: string }).code === 'P2002') {
      throw codedConflict('MEMBERSHIP_ALREADY_VERIFIED');
    }
    throw error;
  }
}

/** Kayıtta seçilebilir bölümler (PM kararı): alan adı üniversiteyi gösteriyorsa onun bölümleri, yoksa hepsi. */
export async function listSelectableDepartments(
  db: PrismaClient,
  actor: Actor,
): Promise<SelectableDepartmentsOutput> {
  const user = await loadOwnEmail(db, actor.userId);
  const universities = await db.university.findMany({
    select: {
      id: true,
      name: true,
      studentEmailDomains: true,
      staffEmailDomains: true,
      faculties: {
        select: { name: true, departments: { select: { id: true, name: true } } },
      },
    },
  });

  const matching = universities.filter(
    (university) => selfVerifiableRoles(user.email, university).length > 0,
  );
  const scope = matching.length > 0 ? ('EMAIL_DOMAIN' as const) : ('ALL' as const);
  const pool = matching.length > 0 ? matching : universities;

  const departments = pool.flatMap((university) =>
    university.faculties.flatMap((faculty) =>
      faculty.departments.map((department) => ({
        id: department.id,
        name: department.name,
        facultyName: faculty.name,
        universityName: university.name,
      })),
    ),
  );
  const collator = new Intl.Collator('tr-TR');
  departments.sort(
    (a, b) =>
      collator.compare(a.universityName, b.universityName) ||
      collator.compare(a.facultyName, b.facultyName) ||
      collator.compare(a.name, b.name),
  );
  return { scope, departments };
}

/** “Doğrulama bekliyor / belge yükle / reddedildi” ekranlarının veri kaynağı. */
export async function getVerificationState(
  db: PrismaClient,
  actor: Actor,
): Promise<VerificationState> {
  const user = await loadOwnEmail(db, actor.userId);
  const [universities, memberships, pending, decided] = await Promise.all([
    db.university.findMany({ select: { studentEmailDomains: true, staffEmailDomains: true } }),
    db.membership.findMany({
      where: { userId: actor.userId, endedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        departmentId: true,
        role: true,
        verificationStatus: true,
        endedAt: true,
        department: { select: { name: true } },
      },
    }),
    db.graduationDocument.findFirst({
      where: { userId: actor.userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        departmentId: true,
        graduationYear: true,
        createdAt: true,
        department: { select: { name: true } },
      },
    }),
    db.graduationDocument.findFirst({
      where: { userId: actor.userId, status: { in: ['APPROVED', 'REJECTED'] } },
      orderBy: { reviewedAt: 'desc' },
      select: { status: true, departmentId: true, rejectReason: true, reviewedAt: true },
    }),
  ]);

  const status = deriveVerificationOverall({
    memberships,
    hasPendingDocument: pending !== null,
    latestDecision: decided && decided.status !== 'PENDING' ? decided.status : null,
  });

  return {
    status,
    emailKind: emailKindOf(user.email, universities),
    memberships: memberships.map((membership) => ({
      id: membership.id,
      departmentId: membership.departmentId,
      departmentName: membership.department.name,
      role: membership.role,
      verificationStatus: membership.verificationStatus,
    })),
    pendingDocument: pending
      ? {
          id: pending.id,
          departmentId: pending.departmentId,
          departmentName: pending.department.name,
          graduationYear: pending.graduationYear,
          submittedAt: pending.createdAt,
        }
      : null,
    rejection:
      status === 'REJECTED' &&
      decided?.status === 'REJECTED' &&
      decided.rejectReason &&
      decided.reviewedAt
        ? {
            departmentId: decided.departmentId,
            reason: decided.rejectReason,
            decidedAt: decided.reviewedAt,
          }
        : null,
  };
}
