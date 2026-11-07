import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { codedValidation } from '@/lib/errors';

import {
  findMetadataProblems,
  findReasonProblem,
  isAdminAction,
  isAuditTargetType,
  type AdminActionName,
  type AuditMetadata,
  type AuditTargetType,
} from '../rules/adminAudit';

export type AuditClient = Pick<Prisma.TransactionClient, 'adminAuditLog'>;

/** Geliştirici hatası (bilinmeyen eylem, kişisel veri taşıyan metadata): kullanıcıya gösterilmez. */
export class AuditPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditPolicyError';
  }
}

export type AdminActionEntry = {
  /** Eylemi yapan yönetici (yetki korumasından geçmiş kullanıcı). */
  actor: { readonly userId: string };
  action: AdminActionName;
  targetType: AuditTargetType;
  targetId: string;
  /** Yönetici girdisi; bazı eylemlerde zorunlu (`rules/adminAudit`). Kişisel veri içeremez. */
  reason?: string | null;
  /** Yalnız kimlikler ve sade değerler; kişisel veri reddedilir. */
  metadata?: AuditMetadata;
};

/**
 * Yönetici eylemini işlem kaydına yazar (D6). Eylemin kendi veritabanı işlemiyle AYNI işlemde çağrılır:
 * `recordAdminAction(tx, …)`; böylece eylem kaydı olmadan gerçekleşemez ve kayıt eylem olmadan kalmaz.
 * Kayıt yalnız eklenir (tetikleyici güncelleme/silmeyi reddeder).
 */
export async function recordAdminAction(
  client: AuditClient,
  entry: AdminActionEntry,
): Promise<{ id: string }> {
  if (!isAdminAction(entry.action)) {
    throw new AuditPolicyError('Bilinmeyen yönetici eylemi');
  }
  if (!isAuditTargetType(entry.targetType)) {
    throw new AuditPolicyError('Bilinmeyen hedef türü');
  }
  if (entry.targetId.trim() === '' || entry.targetId.length > 200) {
    throw new AuditPolicyError('Hedef kimliği geçersiz');
  }

  const reasonProblem = findReasonProblem(entry.action, entry.reason);
  if (reasonProblem === 'REQUIRED') throw codedValidation('AUDIT_REASON_REQUIRED');
  if (reasonProblem === 'INVALID') throw codedValidation('AUDIT_REASON_INVALID');

  const metadata = entry.metadata ?? {};
  const problems = findMetadataProblems(metadata);
  if (problems.length > 0) {
    // Yalnız alan yolları ve sorun türü; değerler mesaja girmez.
    throw new AuditPolicyError(
      `İşlem kaydı metadata'sı reddedildi: ${problems.map((p) => `${p.path} (${p.problem})`).join(', ')}`,
    );
  }

  const reason = entry.reason?.trim();
  const row = await client.adminAuditLog.create({
    data: {
      actorId: entry.actor.userId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: reason ? reason : null,
      metadata,
    },
    select: { id: true },
  });
  return row;
}
