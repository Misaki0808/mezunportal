import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  stillThereInputSchema,
  type StillThereChoice,
  type StillThereInput,
} from '@/contracts/notifications';

function signature(id: string, choice: StillThereChoice, secret: string): string {
  return createHmac('sha256', secret).update(`still-there:v1:${id}:${choice}`).digest('base64url');
}

/** Seçim imzaya dahildir; farklı seçime dönüştürülen bağlantı geçersizdir. */
export function stillThereToken(id: string, choice: StillThereChoice, secret: string): string {
  return `${id}.${signature(id, choice, secret)}`;
}

/** İki seçenek aynı satır için yarışır; doğrulama GET sırasında hiçbir değişiklik yapmaz. */
export async function consumeStillThere(
  db: PrismaClient,
  input: StillThereInput,
  secret: string,
  now = new Date(),
): Promise<StillThereChoice | null> {
  const parsed = stillThereInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { token, choice } = parsed.data;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(signature(parts[0], choice, secret));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return db.$transaction(async (tx) => {
    const consumed = await tx.notificationAction.updateMany({
      where: {
        id: parts[0],
        usedAt: null,
        expiresAt: { gt: now },
        user: { deletedAt: null },
        position: { isCurrent: true },
      },
      data: { usedAt: now, choice },
    });
    if (consumed.count !== 1) return null;
    const action = await tx.notificationAction.findUniqueOrThrow({ where: { id: parts[0] } });
    await tx.profile.updateMany({
      where: { userId: action.userId },
      data: { lastStillThereCheckAt: now },
    });
    return choice;
  });
}
