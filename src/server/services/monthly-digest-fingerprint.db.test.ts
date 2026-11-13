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
import { decideNotification } from './notification-preferences';

const db = createTestPrisma(),
  url = 'http://127.0.0.1:3999';
const mail = vi.hoisted(() => vi.fn());
vi.mock('../jobs/email', () => ({ enqueueEmail: mail }));
let clock = new Date('2026-03-01T05:00:00Z');
let queued: QueuedEmail[] = [];
const send = vi.fn().mockResolvedValue(undefined);
const logger = vi.fn();
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
  logger.mockClear();
  mail.mockReset();
  service = createEmailService(
    createEmailOutbox(db, {
      send: async (...args: unknown[]) => {
        queued.push(args[1] as QueuedEmail);
        return randomUUID();
      },
    }),
    { send, close: () => undefined },
    logger,
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
const OTHER_SECRET = 'r1-td028-baska-gizli-anahtar-'.padEnd(48, 'x');
async function queuedDigest() {
  const { userId, point } = await fixture();
  await stage(userId);
  await relay(userId);
  expect(queued).toHaveLength(1);
  return { userId, point, message: queued[0]! };
}

it('TD-028: kuyruğa alınan özet veri parmak izi taşır (kuyruk şemasından düşmez)', async () => {
  const { message } = await queuedDigest();
  // `queued[0]` kuyruğa verilen, şemadan geçmiş yüktür: alan şemada olmasaydı `safeParse` onu silerdi ve denetim sessizce eski
  // metin karşılaştırmasına dönerdi.
  expect(message.digestFingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(message.text).not.toContain(message.digestFingerprint!);
  expect(await decideNotification(db, message, clock)).toEqual({ send: true });
});

it('TD-028: APP_URL, BETTER_AUTH_SECRET, altbilgi ve metin değişince kuyruktaki özet YİNE gider', async () => {
  const { userId, message } = await queuedDigest();
  // APP_URL (canlıya alımda değişir) ve gizli anahtar döndürme (abonelikten çık jetonu HMAC'i değişir)
  vi.stubEnv('APP_URL', 'http://127.0.0.1:4999');
  expect(await decideNotification(db, message, clock)).toEqual({ send: true });
  vi.stubEnv('APP_URL', url);
  vi.stubEnv('BETTER_AUTH_SECRET', OTHER_SECRET);
  expect(await decideNotification(db, message, clock)).toEqual({ send: true });
  vi.stubEnv('BETTER_AUTH_SECRET', INSECURE_DEV_AUTH_SECRET);
  // Altbilgi, konu, metin ve HTML başka bir şablon sürümünden gelmiş gibi: bayatlık metne bakmaz
  const olderCopy = {
    ...message,
    subject: 'Eski sürümün konusu',
    text:
      message.text.replace('Bildirim tercihlerin:', 'ESKİ ALTBİLGİ:') +
      '\n\nEski sürümün ek satırı',
    html: '<p>eski sunum</p>',
  };
  expect(olderCopy.text).not.toBe(message.text);
  expect(await decideNotification(db, olderCopy, clock)).toEqual({ send: true });
  // Uçtan uca: APP_URL değişmişken teslim EDİLİR (önce bu senaryoda özet sessizce düşüyordu)
  vi.stubEnv('APP_URL', 'http://127.0.0.1:4999');
  vi.stubEnv('BETTER_AUTH_SECRET', OTHER_SECRET);
  await service.deliver(message, 0, 3);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await db.emailLog.findFirst({ where: { recipientUserId: userId } })).toMatchObject({
    status: 'SENT',
    errorCode: null,
  });
  expect(logger.mock.calls.map(([event]) => event)).toEqual(['queued', 'sent']);
});

it('TD-028: veri değişince özet gitmez ve DIGEST_STALE yazar (tercih kodu değil); ay içinde yeniden denenmez', async () => {
  const { userId, point, message } = await queuedDigest();
  await db.pointEntry.update({ where: { id: point.id }, data: { points: 8, basePoints: 8 } });
  expect(await decideNotification(db, message, clock)).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
  await service.deliver(message, 0, 3);
  expect(send).not.toHaveBeenCalled();
  const log = await db.emailLog.findFirst({ where: { recipientUserId: userId } });
  expect(log).toMatchObject({ status: 'FAILED', errorCode: 'DIGEST_STALE' });
  expect(log?.errorCode).not.toBe('EMAIL_PREFERENCE_DISABLED');
  // Kullanıcı bildirimi kapatmadı: tercih kaydı yok
  expect(await db.notificationPreference.count({ where: { userId } })).toBe(0);
  // Günlükte yalnız kararlı olay adı ve maskeli alıcı
  expect(logger.mock.calls.map(([event]) => event)).toEqual(['queued', 'stale']);
  expect(JSON.stringify(logger.mock.calls)).not.toContain('@example');
  // Kalıcı e-posta anahtarı kaldığı için ay içinde yeni özet üretilmez
  clock = new Date('2026-03-02T05:00:00Z');
  await stage(userId);
  expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
});

it('TD-028: bayatlığın başka yolları DIGEST_STALE yazar; EMAIL_PREFERENCE_DISABLED yalnız tercih gerçekten kapalıyken', async () => {
  const { userId, point, message } = await queuedDigest();
  // geçmiş ay
  expect(await decideNotification(db, message, new Date('2026-03-31T21:00:00Z'))).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
  // tercih gerçekten kapalı (veri aynı)
  await db.notificationPreference.create({
    data: { userId, type: 'MONTHLY_DIGEST', enabled: false },
  });
  expect(await decideNotification(db, message, clock)).toEqual({
    send: false,
    errorCode: 'EMAIL_PREFERENCE_DISABLED',
  });
  await service.deliver(message, 0, 3);
  expect(await db.emailLog.findFirst({ where: { recipientUserId: userId } })).toMatchObject({
    status: 'FAILED',
    errorCode: 'EMAIL_PREFERENCE_DISABLED',
  });
  expect(logger.mock.calls.map(([event]) => event)).not.toContain('stale');
  // içerik boşaldı (özet artık üretilemiyor)
  await db.notificationPreference.deleteMany({ where: { userId } });
  await db.pointEntry.delete({ where: { id: point.id } });
  expect(await decideNotification(db, message, clock)).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
});

it('TD-028 geçiş dönemi: parmak izi olmayan eski kuyruk kaydı eski metin denetimiyle doğrulanır', async () => {
  const { message } = await queuedDigest();
  const { digestFingerprint: _dropped, ...legacy } = message;
  expect(_dropped).toBeDefined();
  expect('digestFingerprint' in legacy).toBe(false);
  expect(await decideNotification(db, legacy, clock)).toEqual({ send: true });
  // Eski denetim metne bakar: tek karakter fark ve (geçiş döneminin bilinen sınırı) APP_URL değişimi düşer
  expect(await decideNotification(db, { ...legacy, text: `${legacy.text} ` }, clock)).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
  vi.stubEnv('APP_URL', 'http://127.0.0.1:4999');
  expect(await decideNotification(db, legacy, clock)).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
});

it('TD-028: alıcı artık uygun değilse (hesap silindi, yasaklandı) EMAIL_PREFERENCE_DISABLED değil EMAIL_RECIPIENT_INELIGIBLE yazar', async () => {
  const { userId, message } = await queuedDigest();
  await db.user.update({ where: { id: userId }, data: { banned: true, banExpires: null } });
  expect(await decideNotification(db, message, clock)).toEqual({
    send: false,
    errorCode: 'EMAIL_RECIPIENT_INELIGIBLE',
  });
  await db.user.update({ where: { id: userId }, data: { banned: false, deletedAt: new Date() } });
  expect(await decideNotification(db, message, clock)).toEqual({
    send: false,
    errorCode: 'EMAIL_RECIPIENT_INELIGIBLE',
  });
  await service.deliver(message, 0, 3);
  expect(await db.emailLog.findFirst({ where: { recipientUserId: userId } })).toMatchObject({
    status: 'FAILED',
    errorCode: 'EMAIL_RECIPIENT_INELIGIBLE',
  });
});
