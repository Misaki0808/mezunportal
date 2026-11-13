import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSECURE_DEV_AUTH_SECRET } from '@/lib/env';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { createEmailService, type QueuedEmail } from '../jobs/email-core';
import { createEmailOutbox } from '../jobs/email-outbox';
import { decorateEmail } from '../jobs/email-presentation';
import { scheduleMonthlyDigests } from '../jobs/monthly-digest-task';
import { sendNotificationIntent } from '../jobs/notification-intent-worker';
import { relayNotificationIntents } from './notification-intent';
import { decideNotification, maySendNotification } from './notification-preferences';
import { buildMonthlyDigest } from './monthly-digest';

const db = createTestPrisma(),
  url = 'http://127.0.0.1:3999';
const mail = vi.hoisted(() => vi.fn());
vi.mock('../jobs/email', () => ({ enqueueEmail: mail }));
let clock = new Date('2026-03-01T05:00:00Z');
let queued: QueuedEmail[] = [];
const send = vi.fn().mockResolvedValue(undefined);
let service: ReturnType<typeof createEmailService>;
beforeEach(() => {
  for (const [key, value] of Object.entries({
    APP_ENV: 'test',
    APP_URL: url,
    BETTER_AUTH_SECRET: INSECURE_DEV_AUTH_SECRET,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    EMAIL_FROM: 'test@example.invalid',
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined,
    LINKEDIN_CLIENT_ID: undefined,
    LINKEDIN_CLIENT_SECRET: undefined,
  }))
    vi.stubEnv(key, value);
  clock = new Date('2026-03-01T05:00:00Z');
  queued = [];
  send.mockClear();
  mail.mockReset();
  service = createEmailService(
    createEmailOutbox(db, {
      send: async (...args: unknown[]) => {
        queued.push(args[1] as QueuedEmail);
        return randomUUID();
      },
    }),
    { send, close: () => undefined },
    () => {},
    (message) => decideNotification(db, message, clock),
  );
  mail.mockImplementation((message: QueuedEmail) =>
    service.enqueueEmail(decorateEmail(message, url)),
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());
async function fixture() {
  const inst = await createInstitution(db),
    userId = await createUser(db),
    other = await createUser(db);
  await addMembership(db, { userId, departmentId: inst.deptA1, role: 'STUDENT', entryYear: 2024 });
  await grantRequiredConsents(db, userId);
  const point = await db.pointEntry.create({
    data: {
      userId,
      action: 'SESSION_ONLINE',
      sourceType: 'APPOINTMENT',
      sourceId: randomUUID(),
      points: 7,
      basePoints: 7,
      eventAt: clock,
    },
  });
  await db.pointEntry.create({
    data: {
      userId: other,
      action: 'SESSION_ONLINE',
      sourceType: 'APPOINTMENT',
      sourceId: randomUUID(),
      points: 991,
      basePoints: 991,
      eventAt: clock,
    },
  });
  return { userId, point };
}
async function stage(userId: string) {
  await scheduleMonthlyDigests(db, clock, userId);
  await db.notificationIntent.updateMany({
    where: { userId, kind: 'monthlyDigest' },
    data: { nextAttemptAt: clock },
  });
}
function relay(userId: string) {
  // Ortak relay'nin yalnız bu senaryonun kayıtlarını seçmesini sağla; kilit/işlem gerçek DB'de.
  const scoped = {
    $transaction: db.$transaction.bind(db),
    notificationIntent: {
      findMany: (args: Prisma.NotificationIntentFindManyArgs) =>
        db.notificationIntent.findMany({ ...args, where: { ...args.where, userId } }),
    },
  } as unknown as PrismaClient;
  return relayNotificationIntents(scoped, (row) => sendNotificationIntent(db, row, clock), {
    now: () => clock,
  });
}
it('kapalı tercih, dolu gün ve kuyruk hatası sonrası gerçek relay ertesi gün toparlar; iki koşu tek outbox/teslimdir', async () => {
  const { userId } = await fixture();
  expect(await buildMonthlyDigest(db, userId, clock)).toEqual({
    contribution: { earned: 7, pending: 0 },
  });
  await db.notificationPreference.create({
    data: { userId, type: 'MONTHLY_DIGEST', enabled: false },
  });
  await stage(userId);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
  expect(mail).not.toHaveBeenCalled();
  await db.notificationPreference.update({
    where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
    data: { enabled: true },
  });
  await Promise.all([stage(userId), stage(userId)]);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(1);
  await db.jobMatchDigest.create({ data: { userId, day: '2026-03-01' } });
  await relay(userId);
  expect(queued).toHaveLength(0);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
  clock = new Date('2026-03-02T05:00:00Z');
  await stage(userId);
  mail.mockRejectedValueOnce(new Error('QUEUE_FAILED'));
  expect((await relay(userId)).failed).toBe(1);
  expect(await db.jobMatchDigest.count({ where: { userId } })).toBe(2);
  clock = new Date(+clock + 61_000);
  await relay(userId);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
  clock = new Date('2026-03-03T05:00:00Z');
  await stage(userId);
  await Promise.all([relay(userId), relay(userId)]);
  expect(queued).toHaveLength(1);
  expect(await db.emailLog.count({ where: { recipientUserId: userId } })).toBe(1);
  await service.deliver(queued[0]!, 0, 3);
  await service.deliver(queued[0]!, 0, 3);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await db.emailLog.findFirst({ where: { recipientUserId: userId } })).toMatchObject({
    status: 'SENT',
  });
  clock = new Date('2026-03-04T05:00:00Z');
  await stage(userId);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
});
it('teslimden önce tercih veya içerik değişirse eski özet gönderilmez; geçmiş ay da gönderilmez', async () => {
  const { userId, point } = await fixture();
  await stage(userId);
  await relay(userId);
  expect(queued).toHaveLength(1);
  const message = queued[0]!;
  expect(await maySendNotification(db, message, clock)).toBe(true);
  expect(await maySendNotification(db, message, new Date('2026-03-31T21:00:00Z'))).toBe(false);
  expect(await decideNotification(db, message, new Date('2026-03-31T21:00:00Z'))).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
  await db.notificationPreference.create({
    data: { userId, type: 'MONTHLY_DIGEST', enabled: false },
  });
  expect(await maySendNotification(db, message, clock)).toBe(false);
  expect(await decideNotification(db, message, clock)).toEqual({
    send: false,
    errorCode: 'EMAIL_PREFERENCE_DISABLED',
  });
  await db.notificationPreference.update({
    where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
    data: { enabled: true },
  });
  await db.pointEntry.update({ where: { id: point.id }, data: { points: 8, basePoints: 8 } });
  await service.deliver(message, 0, 3);
  expect(send).not.toHaveBeenCalled();
  expect(await db.emailLog.findFirst({ where: { recipientUserId: userId } })).toMatchObject({
    status: 'FAILED',
    errorCode: 'DIGEST_STALE',
  });
});

it('üretici İstanbul ay sınırında başlar ve ilk hafta dışına taşmaz', async () => {
  const { userId } = await fixture();
  clock = new Date('2026-02-28T20:59:59.999Z');
  await stage(userId);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
  clock = new Date('2026-02-28T21:00:00Z');
  await stage(userId);
  expect(await db.notificationIntent.findFirst({ where: { userId } })).toMatchObject({
    payload: { cycle: '2026-03' },
  });
  await db.notificationIntent.deleteMany({ where: { userId } });
  clock = new Date('2026-03-07T21:00:00Z');
  await stage(userId);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
});
