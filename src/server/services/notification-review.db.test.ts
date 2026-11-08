import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { NOTIFICATION_TYPES } from '@/contracts/notifications';
import { maySendNotification, setNotificationPreferences } from './notification-preferences';
import { consumeStillThere, stillThereToken } from './still-there';
const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('inceleyici: bütün şablonlar kapalı tercihe uyar; ham zorunlu tercih kaydı güvenliği kapatamaz', async () => {
  const user = await db.user.create({
    data: { name: 'Deneme', email: `${randomUUID()}@example.invalid` },
  });
  const optional = [
    'graduation-document.approved',
    'graduation-document.rejected',
    'experience.moderation-approved',
    'experience.moderation-rejected',
    'contact.requested',
    'cv.invitation',
    'profile.freshness',
    'alumni.still-there',
    'student.email-migration',
    ...[
      'requested',
      'confirmed',
      'declined',
      'cancelled',
      'expired',
      'reminder',
      'linkNeeded',
      'linkAdded',
    ].map((event) => `appointment.${event}`),
  ];
  const message = {
    to: user.email,
    recipientUserId: user.id,
    subject: 'Deneme',
    text: 'Deneme',
    idempotencyKey: randomUUID(),
    template: '',
  };
  for (const template of optional)
    expect(await maySendNotification(db, { ...message, template })).toBe(true);
  await setNotificationPreferences(db, user.id, {
    items: NOTIFICATION_TYPES.filter((type) => type !== 'ACCOUNT_SECURITY').map((type) => ({
      type,
      enabled: false,
    })),
  });
  for (const template of optional)
    expect(await maySendNotification(db, { ...message, template })).toBe(false);
  await db.notificationPreference.create({
    data: { userId: user.id, type: 'ACCOUNT_SECURITY', enabled: false },
  });
  for (const template of [
    'auth.sign-in-link',
    'auth.change-email-confirmation',
    'auth.change-email-verification',
  ])
    expect(await maySendNotification(db, { ...message, template })).toBe(true);
  await setNotificationPreferences(db, user.id, {
    items: [{ type: 'CONTACT_REQUEST', enabled: true }],
  });
  expect(
    await maySendNotification(db, {
      ...message,
      template: 'contact.requested',
      to: 'old@example.invalid',
    }),
  ).toBe(false);
  await db.user.update({ where: { id: user.id }, data: { banned: true } });
  expect(await maySendNotification(db, { ...message, template: 'contact.requested' })).toBe(false);
  await db.user.update({ where: { id: user.id }, data: { banned: false, deletedAt: new Date() } });
  expect(await maySendNotification(db, { ...message, template: 'contact.requested' })).toBe(false);
});

it('inceleyici: bozuk imza, tam süre sınırı, başka hesap ve eski pozisyon yanıtı tüketmez', async () => {
  const user = await db.user.create({
    data: { name: 'Mezun', email: `${randomUUID()}@example.invalid`, profile: { create: {} } },
  });
  const other = await db.user.create({
    data: { name: 'Başka', email: `${randomUUID()}@example.invalid` },
  });
  const position = await db.position.create({
    data: {
      userId: user.id,
      companyRaw: 'Kurum',
      titleRaw: 'Unvan',
      source: 'MANUAL',
      isCurrent: true,
    },
  });
  const now = new Date(),
    action = await db.notificationAction.create({
      data: {
        userId: user.id,
        positionId: position.id,
        cycle: randomUUID(),
        expiresAt: new Date(now.getTime() + 1000),
      },
    });
  const input = {
    token: stillThereToken(action.id, 'YES', 'review-secret'),
    choice: 'YES' as const,
  };
  const [id, signature] = input.token.split('.');
  const changed = `${id}.${signature![0] === 'a' ? 'b' : 'a'}${signature!.slice(1)}`;
  expect(
    await consumeStillThere(db, { ...input, token: changed }, 'review-secret', user.id, now),
  ).toBeNull();
  expect(await consumeStillThere(db, input, 'review-secret', other.id, now)).toBeNull();
  expect(
    await consumeStillThere(db, input, 'review-secret', user.id, new Date(now.getTime() + 1000)),
  ).toBeNull();
  await db.position.update({ where: { id: position.id }, data: { isCurrent: false } });
  expect(await consumeStillThere(db, input, 'review-secret', user.id, now)).toBeNull();
  expect(
    (await db.notificationAction.findUniqueOrThrow({ where: { id: action.id } })).usedAt,
  ).toBeNull();
  await db.position.update({ where: { id: position.id }, data: { isCurrent: true } });
  expect(await consumeStillThere(db, input, 'review-secret', user.id, now)).toBe('YES');
  expect(await consumeStillThere(db, input, 'review-secret', user.id, now)).toBeNull();
});
