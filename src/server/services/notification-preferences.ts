import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
  setNotificationPreferencesSchema,
  type NotificationPreferences,
  type SetNotificationPreferencesInput,
} from '@/contracts/notifications';
import type { QueuedEmail, SendDecision } from '@/server/jobs/email-core';
import { notificationTypeForTemplate } from '@/server/rules/notification';
import { addDays } from '@/server/rules/jobPosting';
import { visibleJobPostingIds } from '../repositories/job-postings';

export async function getNotificationPreferences(
  db: PrismaClient,
  userId: string,
): Promise<NotificationPreferences> {
  const rows = await db.notificationPreference.findMany({
    where: { userId },
    select: { type: true, enabled: true },
  });
  const values = new Map(rows.map((row) => [row.type, row.enabled]));
  return {
    items: NOTIFICATION_TYPES.map((type) => ({
      type,
      mandatory: NOTIFICATION_CATALOG[type].mandatory,
      enabled: NOTIFICATION_CATALOG[type].mandatory || (values.get(type) ?? true),
    })),
  };
}
export async function setNotificationPreferences(
  db: PrismaClient,
  userId: string,
  input: SetNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const parsed = setNotificationPreferencesSchema.parse(input);
  await db.$transaction(
    parsed.items
      .filter((item) => !NOTIFICATION_CATALOG[item.type].mandatory)
      .map((item) =>
        db.notificationPreference.upsert({
          where: { userId_type: { userId, type: item.type } },
          create: { userId, type: item.type, enabled: item.enabled },
          update: { enabled: item.enabled },
        }),
      ),
  );
  return getNotificationPreferences(db, userId);
}
const SEND: SendDecision = { send: true };
const INELIGIBLE: SendDecision = { send: false, errorCode: 'EMAIL_RECIPIENT_INELIGIBLE' };
const stale = (errorCode: 'DIGEST_STALE' | 'JOB_MATCH_STALE' | 'APPLICATION_WINDOW_STALE') =>
  ({ send: false, errorCode }) as const;

/**
 * Önce sınıflandır, sonra güncel kullanıcı/adres/tercihi kontrol et. Güvenlik e-postası zorunludur. Karar SEBEBİYLE döner
 * (çıkış kutusu satırının `errorCode`'u): `EMAIL_PREFERENCE_DISABLED` yalnız kullanıcı bildirimi gerçekten kapattığında;
 * alıcı artık uygun değilse `EMAIL_RECIPIENT_INELIGIBLE`; kuyruktaki içerik bayatsa `DIGEST_STALE` / `JOB_MATCH_STALE` /
 * `APPLICATION_WINDOW_STALE` (operatör "kullanıcı kapattı" sanmasın).
 */
export async function decideNotification(
  db: PrismaClient,
  message: QueuedEmail,
  now: Date = new Date(),
): Promise<SendDecision> {
  // Davet yalnız henüz hesabı olmayan adrese gider; mevcut hesap tercihleri atlanmaz.
  if (message.template === 'pilot.invitation') {
    if (message.recipientUserId) return INELIGIBLE;
    const existing = await db.user.findFirst({
      where: { email: { equals: message.to, mode: 'insensitive' } },
      select: { id: true },
    });
    return existing ? INELIGIBLE : SEND;
  }
  const type = notificationTypeForTemplate(message.template);
  if (!type) throw new Error('NOTIFICATION_TEMPLATE_UNKNOWN');
  if (NOTIFICATION_CATALOG[type].mandatory) return SEND;
  if (!message.recipientUserId) return INELIGIBLE;
  const user = await db.user.findUnique({
    where: { id: message.recipientUserId },
    select: { email: true, deletedAt: true, banned: true, banExpires: true },
  });
  if (
    !user ||
    user.deletedAt ||
    (user.banned && (!user.banExpires || user.banExpires > now)) ||
    user.email.toLowerCase() !== message.to.toLowerCase()
  )
    return INELIGIBLE;
  if (type === 'JOB_MATCH') {
    const day = message.idempotencyKey.split(':').at(-1);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return stale('JOB_MATCH_STALE');
    const dayStart = new Date(`${day}T00:00:00+03:00`);
    const dayEnd = new Date(`${addDays(day, 1)}T00:00:00+03:00`);
    const matches = await db.jobMatch.findMany({
      where: {
        userId: message.recipientUserId,
        createdAt: { gte: dayStart, lt: dayEnd },
        posting: {
          targets: {
            some: {
              department: {
                memberships: {
                  some: {
                    userId: message.recipientUserId,
                    role: 'STUDENT',
                    verificationStatus: 'VERIFIED',
                    endedAt: null,
                  },
                },
              },
            },
          },
        },
      },
      select: { postingId: true },
    });
    if (
      !(
        await visibleJobPostingIds(
          db,
          matches.map((match) => match.postingId),
          new Date(),
        )
      ).length
    )
      return stale('JOB_MATCH_STALE');
  }
  if (type === 'APPLICATION_WINDOW') {
    const cycle = message.idempotencyKey.split(':').at(-1);
    if (!cycle || !/^\d{4}-\d{2}$/.test(cycle)) return stale('APPLICATION_WINDOW_STALE');
    const { hasCurrentApplicationWindow } = await import('./application-window');
    if (!(await hasCurrentApplicationWindow(db, message.recipientUserId, cycle, now)))
      return stale('APPLICATION_WINDOW_STALE');
  }
  if (type === 'MONTHLY_DIGEST') {
    const cycle = message.idempotencyKey.split(':').at(-1);
    const { istanbulDay } = await import('../rules/jobPosting');
    if (!cycle || cycle !== istanbulDay(now).slice(0, 7)) return stale('DIGEST_STALE');
    const { buildMonthlyDigest } = await import('./monthly-digest');
    const { isCodedError } = await import('@/lib/errors');
    try {
      const digest = await buildMonthlyDigest(db, message.recipientUserId, now);
      if (!digest) return stale('DIGEST_STALE');
      if (message.digestFingerprint !== undefined) {
        // Bayatlık veriye bakar: işlenmiş metne, APP_URL'ye, gizli anahtara ya da altbilgiye değil (TD-028).
        const { digestFingerprint } = await import('../rules/digest');
        if (digestFingerprint(digest, cycle) !== message.digestFingerprint)
          return stale('DIGEST_STALE');
      } else {
        // Geçiş dönemi: parmak izinden ÖNCE kuyruğa alınmış kayıt eski metin denetimiyle doğrulanır.
        const { getAuthEnv } = await import('@/lib/env');
        const { monthlyDigestEmail } = await import('./monthly-digest-email');
        const { decorateEmail } = await import('../jobs/email-presentation');
        const env = getAuthEnv();
        const expected = monthlyDigestEmail(
          digest,
          message.recipientUserId,
          env.BETTER_AUTH_SECRET,
          env.APP_URL,
        );
        const rendered = decorateEmail({ ...message, ...expected }, env.APP_URL);
        if (message.subject !== expected.subject || message.text !== rendered.text)
          return stale('DIGEST_STALE');
      }
    } catch (error) {
      // Özet kurulamıyorsa alıcı artık uygun değildir (onay çekildi, üyelik doğrulaması yok).
      if (isCodedError(error)) return INELIGIBLE;
      throw error;
    }
  }
  const preference = await db.notificationPreference.findUnique({
    where: { userId_type: { userId: message.recipientUserId, type } },
    select: { enabled: true },
  });
  return (preference?.enabled ?? true)
    ? SEND
    : { send: false, errorCode: 'EMAIL_PREFERENCE_DISABLED' };
}

/** Yalnız gönderilsin mi sorusu: sebep gerekmeyen çağıranlar (testler) için `decideNotification`'ın boolean hâli. */
export async function maySendNotification(
  db: PrismaClient,
  message: QueuedEmail,
  now: Date = new Date(),
): Promise<boolean> {
  return (await decideNotification(db, message, now)).send;
}
