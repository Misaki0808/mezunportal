import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSECURE_DEV_AUTH_SECRET } from '@/lib/env';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { decorateEmail } from '../jobs/email-presentation';
import { scheduleMonthlyDigests } from '../jobs/monthly-digest-task';
import { sendNotificationIntent } from '../jobs/notification-intent-worker';
import { buildMonthlyDigest } from './monthly-digest';
import { monthlyDigestEmail } from './monthly-digest-email';
import { maySendNotification } from './notification-preferences';

const db = createTestPrisma();
const mail = vi.hoisted(() => vi.fn().mockResolvedValue({ emailLogId: 'queued-email' }));
vi.mock('../jobs/email', () => ({ enqueueEmail: mail }));
const now = new Date('2026-02-28T21:00:00Z');
const url = 'http://127.0.0.1:3999';
beforeEach(() => {
  mail.mockClear();
  vi.stubEnv('APP_ENV', 'test');
  vi.stubEnv('APP_URL', url);
  vi.stubEnv('BETTER_AUTH_SECRET', INSECURE_DEV_AUTH_SECRET);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

it('boş hesap niyet üretmez; anonim yazar gizli, kapsam dışı deneyim dışarıda, tekrar tek gönderim', async () => {
  const institution = await createInstitution(db);
  const other = await createInstitution(db);
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, userId);
  expect(await buildMonthlyDigest(db, userId, now)).toBeNull();
  await scheduleMonthlyDigests(db, now, userId);
  expect(await db.notificationIntent.count({ where: { userId, kind: 'monthlyDigest' } })).toBe(0);
  const author = await createUser(db);
  const row = await db.experience.create({
    data: {
      authorId: author,
      departmentIdAtWrite: institution.deptA1,
      type: 'INTERNSHIP',
      status: 'PUBLISHED',
      isAnonymous: true,
      moderatedAt: now,
      moderatedById: author,
      organizationName: 'Kurum',
      termYear: 2025,
      termSeason: 'SPRING',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      whatLearned: 'Öğrendim',
      advice: 'Çalışın',
      publishedAt: new Date('2026-02-10T12:00:00Z'),
    },
  });
  await db.experience.create({
    data: {
      authorId: author,
      departmentIdAtWrite: other.deptA1,
      type: 'INTERNSHIP',
      status: 'PUBLISHED',
      moderatedAt: now,
      moderatedById: author,
      organizationName: 'Kurum',
      termYear: 2025,
      termSeason: 'SPRING',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      whatLearned: 'Öğrendim',
      advice: 'Çalışın',
      publishedAt: new Date('2026-02-10T12:00:00Z'),
    },
  });
  const digest = await buildMonthlyDigest(db, userId, now);
  expect(digest?.experiences).toEqual([{ id: row.id, label: 'Staj' }]);
  expect(JSON.stringify(digest)).not.toContain(author);
  await scheduleMonthlyDigests(db, now, userId);
  await scheduleMonthlyDigests(db, now, userId);
  expect(await db.notificationIntent.count({ where: { userId, kind: 'monthlyDigest' } })).toBe(1);
  const intent = await db.notificationIntent.findFirstOrThrow({
    where: { userId, kind: 'monthlyDigest' },
    select: { id: true, userId: true, payload: true },
  });
  await db.jobMatchDigest.createMany({
    data: ['2026-02-24', '2026-02-25', '2026-02-26'].map((day) => ({ userId, day })),
  });
  await sendNotificationIntent(db, intent, now);
  expect(mail).not.toHaveBeenCalled();
  await db.jobMatchDigest.deleteMany({ where: { userId } });
  await db.jobMatchDigest.create({ data: { userId, day: '2026-03-01' } });
  await sendNotificationIntent(db, intent, now);
  expect(mail).not.toHaveBeenCalled();
  await db.jobMatchDigest.deleteMany({ where: { userId } });
  mail.mockRejectedValueOnce(new Error('QUEUE_FAILED'));
  await expect(sendNotificationIntent(db, intent, now)).rejects.toThrow('QUEUE_FAILED');
  expect(
    await db.jobMatchDigest.findUnique({ where: { userId_day: { userId, day: '2026-03-01' } } }),
  ).not.toBeNull();
  mail.mockClear();
  await db.jobMatchDigest.deleteMany({ where: { userId } });
  await sendNotificationIntent(db, intent, now);
  await sendNotificationIntent(db, intent, now);
  expect(mail).toHaveBeenCalledTimes(1);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const content = monthlyDigestEmail(digest!, userId, INSECURE_DEV_AUTH_SECRET, url);
  const queued = decorateEmail(
    {
      ...content,
      to: user.email,
      recipientUserId: userId,
      template: 'monthlyDigest.summary',
      idempotencyKey: `monthly-digest:${userId}:2026-03`,
    },
    url,
  );
  expect(await maySendNotification(db, queued, now)).toBe(true);
  await db.notificationPreference.upsert({
    where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
    create: { userId, type: 'MONTHLY_DIGEST', enabled: false },
    update: { enabled: false },
  });
  expect(await maySendNotification(db, queued, now)).toBe(false);
  await db.notificationPreference.update({
    where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
    data: { enabled: true },
  });
  await db.experience.delete({ where: { id: row.id } });
  expect(await maySendNotification(db, queued, now)).toBe(false);
});
