import 'server-only';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedNotFound, codedForbidden } from '@/lib/errors';

import { errorForDenyReason } from '../permissions/guards';
import { loadActor } from '../permissions/actor';
import { resolveDepartmentScope } from '../permissions/scope';
import { evaluateAccess } from '../rules/authorization';
import { planAlumniTransition } from '../rules/membershipTransition';
import { recordAdminAction } from './audit';

export type AlumniTransitionInput = {
  /** Geçişi yapan yönetici (kimliği yetki korumasından gelir; yetki işlem İÇİNDE yeniden doğrulanır). */
  admin: { readonly userId: string };
  userId: string;
  departmentId: string;
  graduationYear: number;
  /** `GRADUATION_DOCUMENT`: belge onayı · `ADMIN`: yöneticinin toplu mezun listesi. */
  method: 'GRADUATION_DOCUMENT' | 'ADMIN';
  reason?: string;
  now?: Date;
};

export type AlumniTransitionResult = {
  outcome: 'TRANSITIONED' | 'ALREADY_TRANSITIONED';
  studentMembershipId: string | null;
  alumniMembershipId: string;
};

/**
 * Rol geçişi: mezun olan öğrenciye `ALUMNI` üyeliği eklenir (ya da bekleyen mezun üyeliği doğrulanır),
 * `STUDENT` üyeliği kapanır. Geçmiş korunur: hiçbir satır silinmez; içerik ve puan `userId`'ye bağlı
 * olduğundan etkilenmez. Hepsi TEK işlemde ve işlem kaydıyla (`ROLE_TRANSITION`) birliktedir.
 *
 * - Yetki işlemin İÇİNDE güncel veriyle yeniden değerlendirilir: yöneticinin o bölümü kapsaması ve
 *   doğrulanmış, askıda olmaması gerekir (bayat bir oturum/Actor yetki vermez).
 * - Eşzamanlı çağrılar kullanıcının üyelik satırlarında `FOR UPDATE` ile sıralanır; ikinci çağrı
 *   `ALREADY_TRANSITIONED` döner (çift gönderim idempotent: ikinci kayıt/denetim satırı yok).
 */
export async function transitionStudentToAlumni(
  db: PrismaClient,
  input: AlumniTransitionInput,
): Promise<AlumniTransitionResult> {
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    // 1) Yetki: güncel olgularla, işlemin içinde.
    const admin = await loadActor(tx, input.admin.userId, now);
    const department = await resolveDepartmentScope(tx, input.departmentId);
    if (!admin || !department) throw codedForbidden('AUTH_FORBIDDEN');
    const decision = evaluateAccess(admin.facts, {
      action: 'adminScope',
      target: { kind: 'DEPARTMENT', department },
    });
    if (!decision.allowed) throw errorForDenyReason(decision.reason);

    // 2) Hedef kullanıcı var ve silinmemiş.
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { deletedAt: true },
    });
    if (!target || target.deletedAt !== null) throw codedNotFound('RESOURCE_NOT_FOUND');

    // 3) Aynı kullanıcı+bölüm geçişlerini sırala (satır kilidi), sonra GÜNCEL durumu oku.
    await tx.$queryRaw`
      SELECT "id" FROM "Membership"
      WHERE "userId" = ${input.userId} AND "departmentId" = ${input.departmentId}
      FOR UPDATE`;
    const memberships = await tx.membership.findMany({
      where: { userId: input.userId, departmentId: input.departmentId, endedAt: null },
      select: {
        id: true,
        role: true,
        verificationStatus: true,
        entryYear: true,
        endedAt: true,
      },
    });

    const plan = planAlumniTransition(memberships, { graduationYear: input.graduationYear }, now);
    if (plan.outcome === 'INVALID') {
      throw codedConflict('MEMBERSHIP_TRANSITION_INVALID', { reason: plan.reason });
    }
    if (plan.outcome === 'ALREADY_TRANSITIONED') {
      return {
        outcome: 'ALREADY_TRANSITIONED',
        studentMembershipId: null,
        alumniMembershipId: plan.alumniMembershipId,
      };
    }

    // 4) Uygula: öğrenci üyeliği kapanır, mezun üyeliği doğrulanmış olarak etkinleşir.
    const alumniMembershipId = await applyAlumniTransitionPlan(tx, {
      plan,
      userId: input.userId,
      departmentId: input.departmentId,
      adminUserId: admin.userId,
      method: input.method,
      graduationYear: input.graduationYear,
      now,
    });

    // 5) İşlem kaydı — aynı işlemde (kayıt yazılamazsa geçiş de geri alınır).
    await recordAdminAction(tx, {
      actor: admin,
      action: 'ROLE_TRANSITION',
      targetType: 'MEMBERSHIP',
      targetId: alumniMembershipId,
      reason: input.reason,
      metadata: {
        userId: input.userId,
        departmentId: input.departmentId,
        fromMembershipId: plan.endStudentMembershipId,
        toMembershipId: alumniMembershipId,
        alumniAction: plan.alumni.action,
        method: input.method,
        graduationYear: input.graduationYear,
      },
    });

    return {
      outcome: 'TRANSITIONED',
      studentMembershipId: plan.endStudentMembershipId,
      alumniMembershipId,
    };
  });
}

type TransitionPlan = Extract<ReturnType<typeof planAlumniTransition>, { outcome: 'TRANSITION' }>;
type MembershipWriter = Pick<Prisma.TransactionClient, 'membership'>;

/**
 * Geçiş planını uygular (öğrenci üyeliğini kapatır, mezun üyeliğini oluşturur/doğrular) ve mezun üyelik
 * kimliğini döner. Çağıran AYNI işlemde yetkiyi doğrulamış, satırları kilitlemiş ve işlem kaydını yazmış
 * olmalıdır; mezun belgesi onayı da bu işlevi kullanır.
 */
export async function applyAlumniTransitionPlan(
  tx: MembershipWriter,
  input: {
    plan: TransitionPlan;
    userId: string;
    departmentId: string;
    adminUserId: string;
    method: 'GRADUATION_DOCUMENT' | 'ADMIN';
    graduationYear: number;
    now: Date;
  },
): Promise<string> {
  const { plan, now } = input;
  await tx.membership.update({
    where: { id: plan.endStudentMembershipId },
    data: { endedAt: now },
  });

  const verified = {
    verificationStatus: 'VERIFIED' as const,
    verificationMethod: input.method,
    verifiedAt: now,
    verifiedById: input.adminUserId,
    graduationYear: input.graduationYear,
  };
  switch (plan.alumni.action) {
    case 'CREATE': {
      const created = await tx.membership.create({
        data: {
          userId: input.userId,
          departmentId: input.departmentId,
          role: 'ALUMNI',
          entryYear: plan.entryYear,
          ...verified,
        },
        select: { id: true },
      });
      return created.id;
    }
    case 'VERIFY_PENDING':
      // Belge akışında bekleyen mezun satırı giriş yılını bilmez; öğrenci üyeliğinden devralınır (geçmiş).
      await tx.membership.update({
        where: { id: plan.alumni.membershipId },
        data: { ...verified, ...(plan.entryYear !== null ? { entryYear: plan.entryYear } : {}) },
      });
      return plan.alumni.membershipId;
    case 'KEEP_VERIFIED':
      return plan.alumni.membershipId;
  }
}
