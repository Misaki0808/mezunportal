import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';
import { maySendNotification } from '../services/notification-preferences';
const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('./email', () => ({ enqueueEmail: mocks.enqueue }));
vi.mock('@/lib/env', () => ({ getAuthEnv: () => ({ APP_URL: 'https://example.org' }) }));
import { sendNotificationIntent } from './notification-intent-worker';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-06-21T09:00:00Z'));
  mocks.enqueue.mockReset();
  mocks.enqueue.mockImplementation(async (input) => {
    const row = await db.emailLog.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        idempotencyKey: input.idempotencyKey,
        template: input.template,
        recipientUserId: input.recipientUserId,
      },
      update: {},
    });
    return { emailLogId: row.id };
  });
});
async function fixture() {
  const inst = await createInstitution(db),
    userId = await createUser(db),
    authorId = await createUser(db);
  const posting = await db.jobPosting.create({
    data: {
      authorId,
      departmentIdAtWrite: inst.deptA1,
      status: 'PUBLISHED',
      location: 'İstanbul',
      title: 'Yazılım stajı',
      organizationName: 'Örnek Kurum',
      description: 'Yazılım geliştirme ekibinde uygulamalı staj fırsatı.',
      applyMethod: 'URL',
      applyUrl: 'https://example.org/basvur',
      deadlineOn: new Date('2030-07-01T00:00:00Z'),
      submittedAt: new Date('2030-06-20T09:00:00Z'),
      moderatedAt: new Date('2030-06-20T09:00:00Z'),
      publishedAt: new Date('2030-06-20T09:00:00Z'),
      moderatedById: authorId,
    },
  });
  await db.jobMatch.create({
    data: { postingId: posting.id, userId, createdAt: new Date('2030-06-20T09:00:00Z') },
  });
  const row = {
    id: 'test-intent',
    userId,
    payload: { type: 'jobMatch', event: 'digest', day: '2030-06-20' },
  };
  return { userId, postingId: posting.id, row };
}
describe('ilan özeti gerçek PostgreSQL', () => {
  it('gerçek kilitte sekiz eşzamanlı tekrar yalnız bir özet kuyruğa alır', async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 8 }, () => sendNotificationIntent(db, f.row)));
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(await db.jobMatchDigest.count({ where: { userId: f.userId } })).toBe(1);
    expect(await db.emailLog.count({ where: { recipientUserId: f.userId } })).toBe(1);
    const input = mocks.enqueue.mock.calls[0]![0];
    expect(input.text).toContain('/hesap/bildirimler');
    expect(input.text).not.toContain(f.userId);
    expect(input.text).not.toContain(f.postingId);
  });
  it('aynı günün ikinci ilanı aynı niyet ve günlük özete sığar', async () => {
    const f = await fixture();
    await sendNotificationIntent(db, f.row);
    await sendNotificationIntent(db, { ...f.row, id: 'other-intent' });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
  it('son yedi İstanbul gününde üç özetten sonra göndermez, yedinci gün dışını saymaz', async () => {
    const f = await fixture();
    await db.jobMatchDigest.createMany({
      data: ['2030-06-15', '2030-06-17', '2030-06-19'].map((day) => ({ userId: f.userId, day })),
    });
    await sendNotificationIntent(db, f.row);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    await db.jobMatchDigest.delete({
      where: { userId_day: { userId: f.userId, day: '2030-06-15' } },
    });
    await db.jobMatchDigest.create({ data: { userId: f.userId, day: '2030-06-14' } });
    await sendNotificationIntent(db, f.row);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
  it('İstanbul gece yarısında günlük hak yeni güne geçer', async () => {
    const f = await fixture();
    vi.setSystemTime(new Date('2030-06-21T20:59:59Z'));
    await sendNotificationIntent(db, f.row);
    vi.setSystemTime(new Date('2030-06-21T21:00:00Z'));
    await sendNotificationIntent(db, f.row);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(
      (
        await db.jobMatchDigest.findMany({
          where: { userId: f.userId },
          orderBy: { day: 'asc' },
          select: { day: true },
        })
      ).map((x) => x.day),
    ).toEqual(['2030-06-21', '2030-06-22']);
  });
  it('kapalı tercih kuyruğu durdurur; teslim anında kapanan ilan da reddedilir', async () => {
    const f = await fixture();
    await db.notificationPreference.create({
      data: { userId: f.userId, type: 'JOB_MATCH', enabled: false },
    });
    await sendNotificationIntent(db, f.row);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    await db.notificationPreference.update({
      where: { userId_type: { userId: f.userId, type: 'JOB_MATCH' } },
      data: { enabled: true },
    });
    await sendNotificationIntent(db, f.row);
    const message = mocks.enqueue.mock.calls[0]![0];
    expect(await maySendNotification(db, message)).toBe(true);
    await db.jobPosting.update({
      where: { id: f.postingId },
      data: { status: 'CLOSED', endedAt: new Date() },
    });
    expect(await maySendNotification(db, message)).toBe(false);
  });
  it.each(['CLOSED', 'EXPIRED', 'REJECTED'] as const)('%s ilan özet üretmez', async (status) => {
    const f = await fixture();
    await db.jobPosting.update({
      where: { id: f.postingId },
      data: {
        status,
        publishedAt: status === 'REJECTED' ? null : new Date('2030-06-20T09:00:00Z'),
        endedAt: status === 'REJECTED' ? null : new Date(),
        moderationNote: status === 'REJECTED' ? 'Koşulları açık yaz.' : null,
      },
    });
    await sendNotificationIntent(db, f.row);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
