import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PRISMA_OMIT } from '@/lib/prisma-options';
import { createTestPrisma } from '@/test/db';
import { decideNotification } from '../services/notification-preferences';
import { FakeEmailTransport } from '../external/email/fake';
import { createEmailService } from './email-core';
import { createEmailOutbox } from './email-outbox';

// Kart 377: kuyruğa alma işlem içinde ikinci bir havuz bağlantısı tutarsa, havuz boyutu kadar eşzamanlı istek havuzu kilitler
// (her işlem bir bağlantıyı tutup ikincisini bekler). Havuz küçük (3) ve bağlantı zaman aşımı kısa (2 sn): kilitlenme olsaydı
// istekler "timeout exceeded when trying to connect" ile düşerdi.
const POOL = 3;
const url = process.env.DATABASE_URL_TEST!;
const small = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, max: POOL, connectionTimeoutMillis: 2_000 }),
  omit: PRISMA_OMIT,
});
const db = createTestPrisma();
afterAll(async () => {
  await small.$disconnect();
  await db.$disconnect();
});

function service() {
  const queued: string[] = [];
  const outbox = createEmailOutbox(small, {
    send: async (...args: unknown[]) => {
      queued.push((args[1] as { idempotencyKey: string }).idempotencyKey);
      return randomUUID();
    },
  });
  return {
    queued,
    service: createEmailService(
      outbox,
      new FakeEmailTransport(),
      () => {},
      (message) => decideNotification(small, message),
    ),
  };
}

it.each(['auth.sign-in-link', 'contact.requested'])(
  'havuzun (%s) 4 katı eşzamanlı kuyruğa alma tıkanmaz: hepsi başarılı, hepsi yazılır',
  async (template) => {
    const run = randomUUID();
    const count = POOL * 4;
    const users = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        db.user.create({
          data: {
            name: `Sınıf ${index}`,
            email: `havuz-${run}-${index}@example.org`,
            emailVerified: true,
          },
          select: { id: true, email: true },
        }),
      ),
    );
    const { service: email, queued } = service();
    const started = Date.now();
    const results = await Promise.allSettled(
      users.map((user, index) =>
        email.enqueueEmail({
          to: user.email,
          subject: 'Giriş bağlantın',
          text: 'Bağlantı: https://example.org/x',
          template,
          idempotencyKey: `havuz:${run}:${template}:${index}`,
          ...(template === 'auth.sign-in-link' ? {} : { recipientUserId: user.id }),
        }),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected');
    expect(failed.map((result) => String((result as PromiseRejectedResult).reason))).toEqual([]);
    expect(queued).toHaveLength(count);
    expect(
      await db.emailLog.count({
        where: { idempotencyKey: { startsWith: `havuz:${run}:${template}:` } },
      }),
    ).toBe(count);
    // Kilitlenme 2 sn bağlantı zaman aşımına çarpardı; sağlıklı yol çok altında biter.
    expect(Date.now() - started).toBeLessThan(2_000);
  },
);

it('silme önce kilit alırsa kuyruğa alma commit sonrasına kadar bekler ve silinmiş alıcıya iş açmaz (silme yarışı)', async () => {
  const run = randomUUID();
  const user = await db.user.create({
    data: { name: 'Silinecek', email: `yaris-${run}@example.org`, emailVerified: true },
    select: { id: true, email: true },
  });
  const { service: email, queued } = service();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const lockTaken = new Promise<void>((resolve) => (locked = resolve));
  // Silme: kullanıcı satırında FOR UPDATE + deletedAt; commit'ten önce kuyruğa alma başlar.
  const deletion = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
      locked();
      await gate;
    },
    { timeout: 20_000 },
  );
  await lockTaken;
  let settled = false;
  const enqueue = email
    .enqueueEmail({
      to: user.email,
      subject: 'Bildirim',
      text: 'Gizli içerik',
      template: 'contact.requested',
      idempotencyKey: `yaris:${run}`,
      recipientUserId: user.id,
    })
    .finally(() => {
      settled = true;
    });
  // Karar işlemden önce verildi (silme henüz commit olmadı, alıcı etkin görünür); işlem alıcı kilidinde bekler.
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(settled).toBe(false);
  release();
  await deletion;
  expect(await enqueue).toEqual({ emailLogId: null });
  expect(queued).toEqual([]);
  expect(await db.emailLog.count({ where: { idempotencyKey: `yaris:${run}` } })).toBe(0);
});
