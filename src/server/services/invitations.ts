import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedValidation } from '@/lib/errors';
import { loadSystemAdmin, TX_OPTIONS } from './admin-access';
import { recordAdminAction } from './audit';
import { requireConsent } from './privacy';
import { consumeRateLimit, RATE_LIMITS } from './rateLimit';
import { stagePilotInvitation } from './notification-intent';

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
  deps: { db: PrismaClient; secret: string },
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
    for (const address of list) await stagePilotInvitation(tx, adminId, address, deps.secret);
    await recordAdminAction(tx, {
      actor,
      action: 'BULK_INVITATION',
      targetType: 'INVITATION_BATCH',
      targetId: batch,
      metadata: { count: list.length, skippedCount: addresses.length - list.length },
    });
    return { queued: list.length, skipped: addresses.length - list.length };
  }, TX_OPTIONS);
  return eligible;
}
