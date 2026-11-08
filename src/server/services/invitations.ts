import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedValidation } from '@/lib/errors';
import type { QueuedEmail } from '../jobs/email-core';
import { loadSystemAdmin, TX_OPTIONS } from './admin-access';
import { recordAdminAction } from './audit';
import { requireConsent } from './privacy';
import { consumeRateLimit, RATE_LIMITS } from './rateLimit';
import messages from '../../../messages/tr.json';

export const INVITATION_MAX = 100;
export function parseInvitations(input: string): string[] {
  if (input.length > 30000) throw codedValidation('VALIDATION_INVALID');
  const entries = input.split(/[\s,;]+/).filter(Boolean);
  if (entries[0]?.toLowerCase() === 'email' || entries[0]?.toLowerCase() === 'e-posta')
    entries.shift();
  if (
    !entries.length ||
    entries.length > INVITATION_MAX ||
    entries.some((entry) => !z.email().safeParse(entry).success)
  ) {
    throw codedValidation('VALIDATION_INVALID');
  }
  return [...new Set(entries.map((entry) => entry.toLowerCase()))];
}

export async function inviteUsers(
  deps: {
    db: PrismaClient;
    secret: string;
    appUrl: string;
    enqueue: (input: QueuedEmail) => Promise<{ emailLogId: string | null }>;
  },
  adminId: string,
  input: string,
) {
  const addresses = parseInvitations(input);
  const batch = randomUUID();
  const eligible = await deps.db.$transaction(async (tx) => {
    const actor = await loadSystemAdmin(tx, adminId, new Date());
    await requireConsent(tx, adminId);
    await consumeRateLimit(tx, RATE_LIMITS.bulkInvitation, adminId);
    const existing = await tx.user.findMany({
      where: {
        OR: addresses.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
      },
      select: { email: true },
    });
    const present = new Set(existing.map((user) => user.email.toLowerCase()));
    const list = addresses.filter((address) => !present.has(address));
    await recordAdminAction(tx, {
      actor,
      action: 'BULK_INVITATION',
      targetType: 'INVITATION_BATCH',
      targetId: batch,
      metadata: { count: list.length, skippedCount: addresses.length - list.length },
    });
    return list;
  }, TX_OPTIONS);
  let queued = 0;
  let failed = 0;
  for (const address of eligible) {
    try {
      const result = await deps.enqueue({
        to: address,
        subject: messages.invitations.emailSubject,
        text: messages.invitations.emailBody.replace('{url}', new URL('/giris', deps.appUrl).href),
        template: 'pilot.invitation',
        idempotencyKey: createHmac('sha256', deps.secret)
          .update(`${batch}:${address}`)
          .digest('hex'),
      });
      if (result.emailLogId) queued++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { queued, failed, skipped: addresses.length - eligible.length };
}
