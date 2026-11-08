import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from '@/lib/env';
import { enqueueEmail } from '../jobs/email';
import messages from '../../../messages/tr.json';

/** Tek kapı ve tekilleştirme: kişisel not ve CV içeriği e-postaya yazılmaz. */
export function createCvReviewNotifier(db: PrismaClient) {
  return async (userId: string, event: 'requested' | 'answered' | 'expired', id: string) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;
    const copy = messages.cvReview.email[event];
    const url = new URL('/hesap/cv-inceleme', getEnv().APP_URL).href;
    await enqueueEmail({
      to: user.email,
      recipientUserId: userId,
      template: `cv.review.${event}`,
      idempotencyKey: `cv.review.${event}:${id}`,
      subject: copy.subject,
      text: copy.text.replace('{url}', url),
    });
  };
}
