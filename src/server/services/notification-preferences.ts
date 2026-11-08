import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
  setNotificationPreferencesSchema,
  type NotificationPreferences,
  type SetNotificationPreferencesInput,
} from '@/contracts/notifications';
import type { QueuedEmail } from '@/server/jobs/email-core';
import { notificationTypeForTemplate } from '@/server/rules/notification';

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
/** Önce sınıflandır, sonra güncel kullanıcı/adres/tercihi kontrol et. Güvenlik e-postası zorunludur. */
export async function maySendNotification(
  db: PrismaClient,
  message: QueuedEmail,
): Promise<boolean> {
  const type = notificationTypeForTemplate(message.template);
  if (!type) throw new Error('NOTIFICATION_TEMPLATE_UNKNOWN');
  if (NOTIFICATION_CATALOG[type].mandatory) return true;
  if (!message.recipientUserId) return false;
  const user = await db.user.findUnique({
    where: { id: message.recipientUserId },
    select: { email: true, deletedAt: true, banned: true, banExpires: true },
  });
  if (
    !user ||
    user.deletedAt ||
    (user.banned && (!user.banExpires || user.banExpires > new Date())) ||
    user.email.toLowerCase() !== message.to.toLowerCase()
  )
    return false;
  const preference = await db.notificationPreference.findUnique({
    where: { userId_type: { userId: message.recipientUserId, type } },
    select: { enabled: true },
  });
  return preference?.enabled ?? true;
}
