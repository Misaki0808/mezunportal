import 'server-only';

import {
  MAX_DOCUMENT_BYTES,
  hasPdfMagic,
  type GraduationDocumentForm,
  type ListPendingGraduationDocumentsInput,
  type PendingGraduationDocumentPage,
  type ReviewGraduationDocumentInput,
  type ReviewGraduationDocumentOutput,
  type UploadGraduationDocumentOutput,
} from '@/contracts/graduation-document';
import { listPendingGraduationDocumentsSchema } from '@/contracts/graduation-document';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  CodedError,
  codedConflict,
  codedForbidden,
  codedNotFound,
  codedRateLimited,
  codedUnauthenticated,
  codedValidation,
} from '@/lib/errors';

import { AUTH_LIMITS } from '../auth/limits';
import { logAuthFailure } from '../auth/log';
import type { AuthEmailPort } from '../auth/email-port';
import { consumeRateLimit, rateLimitKey } from '../auth/rate-limit';
import { newGraduationDocumentKey, type StorageAdapter } from '../external/storage';
import { loadActor, type Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { listManagedDepartmentIds, resolveDepartmentScope } from '../permissions/scope';
import { findReasonProblem } from '../rules/adminAudit';
import { evaluateAccess } from '../rules/authorization';
import { maskEmail } from '../rules/maskEmail';
import { planAlumniTransition } from '../rules/membershipTransition';
import { applyAlumniTransitionPlan } from './membership';
import { recordAdminAction } from './audit';

export type GraduationDocumentDeps = {
  db: PrismaClient;
  storage: StorageAdapter;
  secret: string;
  now?: () => Date;
};

const nowOf = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

// ---------------------------------------------------------------------------------------------
// Yükleme
// ---------------------------------------------------------------------------------------------

/**
 * Mezun belgesi yükle. Sözleşme doğrulamasını (Zod) çağıran yapmıştır; burada SUNUCU yeniden doğrular ve
 * dosyanın İÇERİĞİNE bakar (sihirli bayt; istemcinin söylediği tür/uzantı güvenilmez).
 * Kullanıcı kilidi alındıktan sonra dosya yazılır → veritabanı kaydı; hata varsa dosya geri silinir.
 */
export async function uploadGraduationDocument(
  deps: GraduationDocumentDeps,
  actor: Actor,
  form: GraduationDocumentForm,
): Promise<UploadGraduationDocumentOutput> {
  const { db, storage } = deps;
  const now = nowOf(deps);

  const limit = await consumeRateLimit(
    db,
    rateLimitKey('document-upload:user', actor.userId, deps.secret),
    AUTH_LIMITS.documentUploadPerUser,
    now,
  );
  if (!limit.allowed) {
    throw codedRateLimited('RATE_LIMITED', { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const bytes = new Uint8Array(await form.file.arrayBuffer());
  if (bytes.length === 0) throw codedValidation('DOCUMENT_EMPTY');
  if (bytes.length > MAX_DOCUMENT_BYTES) throw codedValidation('DOCUMENT_TOO_LARGE');
  if (!hasPdfMagic(bytes)) throw codedValidation('DOCUMENT_NOT_PDF');

  const department = await db.department.findUnique({
    where: { id: form.departmentId },
    select: { id: true },
  });
  if (!department) throw codedNotFound('RESOURCE_NOT_FOUND');

  const verifiedAlumni = await db.membership.findFirst({
    where: {
      userId: actor.userId,
      departmentId: form.departmentId,
      role: 'ALUMNI',
      verificationStatus: 'VERIFIED',
      endedAt: null,
    },
    select: { id: true },
  });
  if (verifiedAlumni) throw codedConflict('MEMBERSHIP_ALREADY_VERIFIED');

  const key = newGraduationDocumentKey(actor.userId);

  try {
    return await db.$transaction(async (tx) => {
      // Hesap silme ile aynı kullanıcı satırı kilitlenir; bayat oturumla dosya bırakılamaz.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { deletedAt: true },
      });
      if (!user || user.deletedAt) throw codedUnauthenticated('AUTH_UNAUTHENTICATED');
      await storage.put(key, bytes, { contentType: 'application/pdf' });
      await tx.$queryRaw`
        SELECT "id" FROM "Membership"
        WHERE "userId" = ${actor.userId} AND "departmentId" = ${form.departmentId}
        FOR UPDATE`;

      // Hedef üyelik: bekleyen mezun üyeliği (doğrulanınca bu satır doğrulanır). Yoksa oluşturulur;
      // öğrenci üyeliği (varsa) onaya kadar etkin kalır — erişim kesintisi olmaz.
      const alumni = await tx.membership.findFirst({
        where: {
          userId: actor.userId,
          departmentId: form.departmentId,
          role: 'ALUMNI',
          endedAt: null,
        },
        select: { id: true },
      });
      if (alumni) {
        await tx.membership.update({
          where: { id: alumni.id },
          data: { graduationYear: form.graduationYear },
        });
      } else {
        await tx.membership.create({
          data: {
            userId: actor.userId,
            departmentId: form.departmentId,
            role: 'ALUMNI',
            graduationYear: form.graduationYear,
            verificationStatus: 'PENDING',
            verificationMethod: 'GRADUATION_DOCUMENT',
          },
        });
      }

      const document = await tx.graduationDocument.create({
        data: {
          userId: actor.userId,
          departmentId: form.departmentId,
          graduationYear: form.graduationYear,
          storageKey: key,
        },
        select: { id: true },
      });
      return { documentId: document.id, status: 'PENDING' as const };
    });
  } catch (error) {
    await storage
      .delete(key)
      .catch((cleanupError: unknown) => logAuthFailure('uploadCleanup', cleanupError));
    // Kullanıcı+bölüm için bekleyen belge zaten var (kısmi benzersiz indeks).
    if ((error as { code?: string }).code === 'P2002') {
      throw codedConflict('DOCUMENT_ALREADY_PENDING');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Yönetici kuyruğu
// ---------------------------------------------------------------------------------------------

export async function listPendingGraduationDocuments(
  deps: { db: PrismaClient },
  actor: Actor,
  rawInput: ListPendingGraduationDocumentsInput = {},
): Promise<PendingGraduationDocumentPage> {
  const { db } = deps;
  const input = listPendingGraduationDocumentsSchema.parse(rawInput);

  // Kapsam: yöneticinin yönettiği bölümler (hesap etkin + doğrulanmış üye değilse boş).
  const scope = await listManagedDepartmentIds(db, actor.facts);
  if (scope.length === 0) {
    const decision = evaluateAccess(actor.facts, { action: 'directoryUse' });
    throw errorForDenyReason(decision.allowed ? 'FORBIDDEN' : decision.reason);
  }
  if (input.departmentId !== undefined && !scope.includes(input.departmentId)) {
    throw codedForbidden('AUTH_FORBIDDEN');
  }
  const departmentIds = input.departmentId !== undefined ? [input.departmentId] : scope;

  if (input.cursor !== undefined) {
    const anchor = await db.graduationDocument.findFirst({
      where: { id: input.cursor, status: 'PENDING', departmentId: { in: departmentIds } },
      select: { id: true },
    });
    if (!anchor) throw codedValidation('VALIDATION_INVALID');
  }

  const rows = await db.graduationDocument.findMany({
    where: { status: 'PENDING', departmentId: { in: departmentIds } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: input.limit + 1,
    ...(input.cursor !== undefined ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      departmentId: true,
      graduationYear: true,
      createdAt: true,
      department: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
  });

  const page = rows.slice(0, input.limit);
  return {
    items: page.map((row) => ({
      id: row.id,
      departmentId: row.departmentId,
      departmentName: row.department.name,
      graduationYear: row.graduationYear,
      submittedAt: row.createdAt,
      applicantName: row.user.name,
      // Yönetici başvuranın ham e-postasını görmez.
      maskedEmail: maskEmail(row.user.email),
    })),
    nextCursor: rows.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Karar
// ---------------------------------------------------------------------------------------------

export type ReviewDeps = GraduationDocumentDeps & {
  /** Karar e-postası; karar işlemi tamamlandıktan SONRA gönderilir, hatası kararı etkilemez. */
  email?: AuthEmailPort;
};

/**
 * Onay ya da gerekçeli ret. TEK işlemde: yetki güncel veriyle yeniden doğrulanır, belge satırı kilitlenir,
 * üyelik güncellenir, işlem kaydı yazılır ve belge dosyası SİLİNİR (silme başarısızsa karar geri alınır:
 * dosya karardan sonra kalmaz). Karar e-postası işlemden sonra kuyruğa verilir.
 */
export async function reviewGraduationDocument(
  deps: ReviewDeps,
  admin: { readonly userId: string },
  input: ReviewGraduationDocumentInput,
): Promise<ReviewGraduationDocumentOutput> {
  const { db, storage } = deps;
  const now = nowOf(deps);

  const outcome = await db.$transaction(async (tx) => {
    // Belge satırını kilitle (aynı belgeye eşzamanlı iki karar sıralanır).
    await tx.$queryRaw`SELECT "id" FROM "GraduationDocument" WHERE "id" = ${input.documentId} FOR UPDATE`;
    const document = await tx.graduationDocument.findUnique({
      where: { id: input.documentId },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        graduationYear: true,
        status: true,
        storageKey: true,
        user: { select: { email: true } },
      },
    });
    if (!document) throw codedNotFound('RESOURCE_NOT_FOUND');

    // Yetki: işlemin içinde, güncel olgularla; kapsam BELGENİN bölümüdür.
    const actor = await loadActor(tx, admin.userId, now);
    const department = await resolveDepartmentScope(tx, document.departmentId);
    if (!actor || !department) throw codedForbidden('AUTH_FORBIDDEN');
    const decision = evaluateAccess(actor.facts, {
      action: 'adminScope',
      target: { kind: 'DEPARTMENT', department },
    });
    if (!decision.allowed) throw errorForDenyReason(decision.reason);

    if (document.status !== 'PENDING') throw codedConflict('DOCUMENT_NOT_PENDING');

    // Üyelik satırlarını kilitle ve güncel durumu oku.
    await tx.$queryRaw`
      SELECT "id" FROM "Membership"
      WHERE "userId" = ${document.userId} AND "departmentId" = ${document.departmentId}
      FOR UPDATE`;
    const active = await tx.membership.findMany({
      where: { userId: document.userId, departmentId: document.departmentId, endedAt: null },
      select: { id: true, role: true, verificationStatus: true, entryYear: true, endedAt: true },
    });

    const decided = {
      storageKey: null,
      reviewedAt: now,
      reviewedById: actor.userId,
    };

    if (input.decision === 'APPROVE') {
      const plan = planAlumniTransition(active, { graduationYear: document.graduationYear }, now);
      let alumniMembershipId: string | null = null;
      let transitionedFrom: string | null = null;

      if (plan.outcome === 'TRANSITION') {
        alumniMembershipId = await applyAlumniTransitionPlan(tx, {
          plan,
          userId: document.userId,
          departmentId: document.departmentId,
          adminUserId: actor.userId,
          method: 'GRADUATION_DOCUMENT',
          graduationYear: document.graduationYear,
          now,
        });
        transitionedFrom = plan.endStudentMembershipId;
      } else if (plan.outcome === 'ALREADY_TRANSITIONED') {
        alumniMembershipId = plan.alumniMembershipId;
      } else if (plan.reason === 'NO_ACTIVE_STUDENT') {
        // Yeni mezun (öğrenci üyeliği yok): bekleyen mezun üyeliği doğrulanır; yoksa oluşturulur.
        const alumni = active.find((membership) => membership.role === 'ALUMNI');
        const verified = {
          verificationStatus: 'VERIFIED' as const,
          verificationMethod: 'GRADUATION_DOCUMENT' as const,
          verifiedAt: now,
          verifiedById: actor.userId,
          graduationYear: document.graduationYear,
        };
        if (alumni?.verificationStatus === 'VERIFIED') {
          alumniMembershipId = alumni.id;
        } else if (alumni) {
          await tx.membership.update({ where: { id: alumni.id }, data: verified });
          alumniMembershipId = alumni.id;
        } else {
          const created = await tx.membership.create({
            data: {
              userId: document.userId,
              departmentId: document.departmentId,
              role: 'ALUMNI',
              ...verified,
            },
            select: { id: true },
          });
          alumniMembershipId = created.id;
        }
      } else {
        // Öğrenci doğrulanmamış / mezuniyet yılı tutarsız: yönetici reddetmeli (üyelik değişmez).
        throw codedConflict('MEMBERSHIP_TRANSITION_INVALID', { reason: plan.reason });
      }

      await tx.graduationDocument.update({
        where: { id: document.id },
        data: { status: 'APPROVED', ...decided },
      });
      await recordAdminAction(tx, {
        actor,
        action: 'DOCUMENT_APPROVE',
        targetType: 'GRADUATION_DOCUMENT',
        targetId: document.id,
        metadata: {
          userId: document.userId,
          departmentId: document.departmentId,
          membershipId: alumniMembershipId,
          graduationYear: document.graduationYear,
        },
      });
      if (transitionedFrom) {
        await recordAdminAction(tx, {
          actor,
          action: 'ROLE_TRANSITION',
          targetType: 'MEMBERSHIP',
          targetId: alumniMembershipId ?? document.id,
          metadata: {
            userId: document.userId,
            departmentId: document.departmentId,
            fromMembershipId: transitionedFrom,
            toMembershipId: alumniMembershipId,
            method: 'GRADUATION_DOCUMENT',
            graduationYear: document.graduationYear,
          },
        });
      }
    } else {
      // RET: gerekçe zorunlu (sözleşme + işlem kaydı politikası). Hiçbir yazma yapılmadan ÖNCE doğrulanır
      // (veritabanı CHECK'i değil, kullanıcıya dönen kararlı hata kodu çıksın).
      const reasonProblem = findReasonProblem('DOCUMENT_REJECT', input.reason);
      if (reasonProblem === 'REQUIRED') throw codedValidation('AUDIT_REASON_REQUIRED');
      if (reasonProblem === 'INVALID') throw codedValidation('AUDIT_REASON_INVALID');
      // Bekleyen mezun üyeliği kapanır.
      await tx.graduationDocument.update({
        where: { id: document.id },
        data: { status: 'REJECTED', rejectReason: input.reason.trim(), ...decided },
      });
      await tx.membership.updateMany({
        where: {
          userId: document.userId,
          departmentId: document.departmentId,
          role: 'ALUMNI',
          verificationStatus: 'PENDING',
          endedAt: null,
        },
        data: { verificationStatus: 'REJECTED', endedAt: now },
      });
      await recordAdminAction(tx, {
        actor,
        action: 'DOCUMENT_REJECT',
        targetType: 'GRADUATION_DOCUMENT',
        targetId: document.id,
        reason: input.reason,
        metadata: { userId: document.userId, departmentId: document.departmentId },
      });
    }

    // Dosya KARAR ANINDA silinir. Silme başarısızsa (StorageError) işlem geri alınır: karar yazılıp dosya
    // kalmaz. Silmeden sonra işlem tamamlanamazsa (çok nadir) belge bekleyen kalır ve dosyası yoktur —
    // yönetici gerekçeyle reddeder, başvuran yeniden yükler.
    if (document.storageKey) await storage.delete(document.storageKey);

    return {
      documentId: document.id,
      decision: input.decision,
      applicantUserId: document.userId,
      applicantEmail: document.user.email,
    };
  });

  // Karar e-postası işlemden SONRA: kuyruğa verilemese de karar geçerlidir.
  if (deps.email) {
    try {
      await deps.email.sendGraduationDocumentDecision({
        to: outcome.applicantEmail,
        userId: outcome.applicantUserId,
        documentId: outcome.documentId,
        decision: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        ...(input.decision === 'REJECT' ? { reason: input.reason.trim() } : {}),
      });
    } catch (error) {
      logAuthFailure('documentDecisionEmail', error);
    }
  }

  return { documentId: outcome.documentId, decision: outcome.decision };
}

// ---------------------------------------------------------------------------------------------
// Dosya okuma (yetki kontrollü rota için)
// ---------------------------------------------------------------------------------------------

/**
 * Bekleyen belgenin dosyasını, belgenin bölümünü kapsayan yöneticiye verir. Başvuran kendi belgesini
 * bu yoldan okuyamaz. Belge/dosya yok, karar verilmiş ya da yetkisiz: hepsi `AUTH_FORBIDDEN`/`NOT_FOUND`
 * ayrımı olmadan aynı hata değildir — yetkisizlik 403, olmayan/karar verilmiş 404.
 */
export async function readGraduationDocumentFile(
  deps: Pick<GraduationDocumentDeps, 'db' | 'storage' | 'now'>,
  adminUserId: string,
  documentId: string,
): Promise<Uint8Array> {
  const { db, storage } = deps;
  const document = await db.graduationDocument.findUnique({
    where: { id: documentId },
    select: { departmentId: true, status: true, storageKey: true },
  });
  if (!document) throw codedNotFound('RESOURCE_NOT_FOUND');

  const actor = await loadActor(db, adminUserId, nowOf(deps));
  const department = await resolveDepartmentScope(db, document.departmentId);
  if (!actor || !department) throw codedForbidden('AUTH_FORBIDDEN');
  const decision = evaluateAccess(actor.facts, {
    action: 'adminScope',
    target: { kind: 'DEPARTMENT', department },
  });
  if (!decision.allowed) throw errorForDenyReason(decision.reason);

  if (document.status !== 'PENDING' || !document.storageKey) {
    throw new CodedError('notFound', 'RESOURCE_NOT_FOUND');
  }
  const bytes = await storage.get(document.storageKey);
  if (!bytes) throw codedNotFound('RESOURCE_NOT_FOUND');
  return bytes;
}
