import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createInstitution } from '@/test/fixtures';
import { INSECURE_DEV_AUTH_SECRET } from '@/lib/env';
const mocks = vi.hoisted(() => ({
  send: vi.fn(async (item: { userId: string; eventId: string }) => {
    void item;
    return 'queued';
  }),
  enqueue: vi.fn(
    async (item: { recipientUserId?: string; idempotencyKey: string; text: string }) => {
      void item;
      return { emailLogId: 'queued' };
    },
  ),
}));
vi.mock('../services/notification-email', () => ({ sendNotification: mocks.send }));
vi.mock('./email', () => ({ enqueueEmail: mocks.enqueue }));
import { profileFreshness, alumniStillThere, studentEmailMigration } from './notification-tasks';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
beforeEach(() => {
  vi.clearAllMocks();
  // Yalnız bağlantı üretimini doğruluyoruz; kimlik ve SMTP yerel ayardan gelmez.
  // Gerçek PostgreSQL istemcisi yalnız DATABASE_URL_TEST ile yukarıda kurulmuştur.
  const env = {
    APP_ENV: 'test',
    APP_URL: 'https://notifications.example.invalid',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/notification_test',
    BETTER_AUTH_SECRET: INSECURE_DEV_AUTH_SECRET,
    SMTP_HOST: 'smtp.example.invalid',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    EMAIL_FROM: 'test@example.invalid',
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined,
    LINKEDIN_CLIENT_ID: undefined,
    LINKEDIN_CLIENT_SECRET: undefined,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
describe('bildirim işleri', () => {
  it('eski profili bir kez hatırlatır ve altı ay dolmadan tekrarlamaz', async () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const user = await db.user.create({
      data: {
        name: 'Deneme',
        email: `${randomUUID()}@example.invalid`,
        profile: { create: { updatedAt: new Date('2026-01-01') } },
      },
    });
    await profileFreshness(db, now);
    await profileFreshness(db, now);
    expect(mocks.send.mock.calls.filter(([item]) => item.userId === user.id)).toHaveLength(1);
    expect(
      (await db.profile.findUniqueOrThrow({ where: { userId: user.id } })).lastFreshnessPromptAt,
    ).toEqual(now);
  });
  it('dördüncü sınıfın kurumsal e-postasına akademik yıl başına aynı anahtarı kullanır', async () => {
    const department = await createInstitution(db, { studentEmailDomains: ['ogr.iu.edu.tr'] });
    const user = await db.user.create({
      data: { name: 'Öğrenci', email: `${randomUUID()}@ogr.iu.edu.tr` },
    });
    await db.membership.create({
      data: {
        userId: user.id,
        departmentId: department.deptA1,
        role: 'STUDENT',
        entryYear: 2023,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationMethod: 'STUDENT_EMAIL',
      },
    });
    await studentEmailMigration(db, new Date('2026-11-08T12:00:00Z'));
    await studentEmailMigration(db, new Date('2027-01-08T12:00:00Z'));
    const calls = mocks.send.mock.calls
      .map(([item]) => item)
      .filter((item) => item.userId === user.id);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.eventId).toBe(calls[1]!.eventId);
  });
  it('mezun hatırlatmasının iş tekrarında anahtarı değişmez', async () => {
    const department = await createInstitution(db);
    const user = await db.user.create({
      data: { name: 'Mezun', email: `${randomUUID()}@example.invalid` },
    });
    await db.membership.create({
      data: {
        userId: user.id,
        departmentId: department.deptA1,
        role: 'ALUMNI',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationMethod: 'ADMIN',
        verifiedById: user.id,
      },
    });
    await db.position.create({
      data: {
        userId: user.id,
        companyRaw: 'Kurum',
        titleRaw: 'Görev',
        source: 'MANUAL',
        isCurrent: true,
      },
    });
    const now = new Date('2026-11-08T12:00:00Z');
    await alumniStillThere(db, now);
    await alumniStillThere(db, now);
    const calls = mocks.enqueue.mock.calls
      .map(([item]) => item)
      .filter((item) => item.recipientUserId === user.id);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.idempotencyKey).toBe(calls[1]!.idempotencyKey);
    expect(calls[0]!.text).toContain('https://notifications.example.invalid/bildirim-yanit#token=');
  });
  it('çok pozisyonda bildirim kayıtlarını sayfa başına toplu sorgular', async () => {
    const department = await createInstitution(db);
    const user = await db.user.create({
      data: { name: 'Test', email: `${randomUUID()}@example.invalid` },
    });
    await db.membership.create({
      data: {
        userId: user.id,
        departmentId: department.deptA1,
        role: 'ALUMNI',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        verificationMethod: 'ADMIN',
        verifiedById: user.id,
      },
    });
    await db.position.createMany({
      data: Array.from({ length: 150 }, (_, i) => ({
        userId: user.id,
        companyRaw: `Test ${i}`,
        titleRaw: 'Görev',
        source: 'MANUAL' as const,
        isCurrent: true,
      })),
    });
    const measured = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST! }),
      log: [{ emit: 'event', level: 'query' }],
    });
    let actionQueries = 0,
      pageQueries = 0;
    measured.$on('query', (event) => {
      if (event.query.includes('"NotificationAction"')) actionQueries++;
      if (event.query.includes('"Position"') && event.query.includes('SELECT')) pageQueries++;
    });
    try {
      await alumniStillThere(measured, new Date('2026-11-08T12:00:00Z'));
      expect(
        mocks.enqueue.mock.calls.filter(([item]) => item.recipientUserId === user.id),
      ).toHaveLength(150);
      expect(pageQueries).toBeGreaterThanOrEqual(2);
      expect(actionQueries).toBeLessThanOrEqual(pageQueries * 3);
    } finally {
      await measured.$disconnect();
    }
  });
});
