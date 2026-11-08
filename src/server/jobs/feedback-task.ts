import 'server-only';
import messages from '../../../messages/tr.json';
import { getEnv } from '@/lib/env';
import type { PrismaClient } from '@/generated/prisma/client';
import { enqueueEmail } from './email';

/** Uygun ancak yanıtlanmamış her taraf için tek kuyruk kaydı; devre dışı tercih taramayı tıkamaz. */
export async function scheduleFeedbackPrompts(db: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const rows = await db.$queryRaw<{ appointmentId: string; userId: string; email: string }[]>`
    SELECT a."id" AS "appointmentId", u."id" AS "userId", u."email"
    FROM "Appointment" a
    JOIN "User" u ON u."id" IN (a."mentorId", a."menteeId")
    LEFT JOIN "SessionFeedback" f ON f."appointmentId" = a."id" AND f."authorId" = u."id"
    LEFT JOIN "NotificationPreference" p ON p."userId" = u."id" AND p."type" = 'APPOINTMENT'
    LEFT JOIN "EmailLog" e ON e."idempotencyKey" = 'appointment.feedback:' || a."id" || ':' || u."id"
    WHERE a."status" IN ('CONFIRMED', 'NO_SHOW') AND a."endsAt" <= ${cutoff}
      AND u."deletedAt" IS NULL AND (NOT u."banned" OR u."banExpires" <= ${now})
      AND f."id" IS NULL AND p."enabled" IS DISTINCT FROM false AND e."id" IS NULL
    ORDER BY a."endsAt" ASC, a."id" ASC, u."id" ASC LIMIT 100`;
  for (const row of rows) {
    const url = new URL(`/hesap/gorusme/${encodeURIComponent(row.appointmentId)}`, getEnv().APP_URL)
      .href;
    await enqueueEmail({
      to: row.email,
      recipientUserId: row.userId,
      template: 'appointment.feedback',
      idempotencyKey: `appointment.feedback:${row.appointmentId}:${row.userId}`,
      subject: messages.feedback.emailSubject,
      text: messages.feedback.emailText.replace('{url}', url),
    });
  }
  return rows.length;
}
