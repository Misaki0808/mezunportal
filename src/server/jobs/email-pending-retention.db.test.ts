import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { createTestPrisma } from '@/test/db';
import { FakeEmailTransport } from '../external/email/fake';
import { createEmailOutbox } from './email-outbox';
import { createEmailService, type QueuedEmail } from './email-core';
import {
  createEmailQueue,
  EMAIL_PENDING_RETENTION_SECONDS,
  EMAIL_QUEUE,
  EMAIL_SECURITY_RETENTION_SECONDS,
  startEmailConsumer,
} from './email-queue';

// Kart 472: işçi kapalıyken kuyruğa giren e-posta, bakımın silme süresi dolsa bile (kısaltılmış süreyle) kaybolmaz.
const SCHEMA = 'pgboss_email_pending_test';
const db = createTestPrisma();
const url = process.env.DATABASE_URL_TEST!;
const bosses: PgBoss[] = [];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (template: string, subject: string): QueuedEmail => ({
  to: 'pending-retention@example.invalid',
  subject,
  text: 'Sahte metin',
  template,
  idempotencyKey: randomUUID(),
});
const jobs = (subjectPrefix: string) => db.$queryRaw<Array<{ state: string; subject: string }>>`
  SELECT state::text, data->>'subject' AS subject FROM pgboss_email_pending_test.job
  WHERE name = ${EMAIL_QUEUE} AND data->>'subject' LIKE ${subjectPrefix + '%'} ORDER BY 2`;
async function until(check: () => Promise<boolean>, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await wait(500);
  }
  return check();
}

beforeAll(async () => {
  const boss = await createEmailQueue(url, { schema: SCHEMA });
  bosses.push(boss);
  await boss.deleteAllJobs(EMAIL_QUEUE);
});
afterAll(async () => {
  for (const boss of bosses) await boss.stop({ graceful: true, timeout: 5000 }).catch(() => {});
  await db.$disconnect();
});

describe('bekleyen e-posta saklaması (kart 472)', () => {
  it('kuyruk bekleyen işi 7 gün saklar; tamamlanan işin yük silmesi 60 saniye kalır', async () => {
    const queue = await bosses[0]!.getQueue(EMAIL_QUEUE);
    expect(queue?.retentionSeconds).toBe(EMAIL_PENDING_RETENTION_SECONDS);
    expect(EMAIL_PENDING_RETENTION_SECONDS).toBe(7 * 24 * 3600);
    expect(queue?.deleteAfterSeconds).toBe(60);
  });

  it('süre iş başına şablona göre atanır: bildirim 7 gün, hesap güvenliği bağlantısı bir saat', async () => {
    const service = createEmailService(
      createEmailOutbox(db, bosses[0]!),
      new FakeEmailTransport(),
      () => undefined,
    );
    await service.enqueueEmail(message('auth.sign-in-link', 'Süre giriş'));
    await service.enqueueEmail(message('auth.change-email-verification', 'Süre doğrulama'));
    await service.enqueueEmail(message('contact.requested', 'Süre bildirim'));
    await service.enqueueEmail(message('test.delivery', 'Süre test'));
    const rows = await db.$queryRaw<Array<{ subject: string; seconds: number }>>`
      SELECT data->>'subject' AS subject, round(extract(epoch FROM (keep_until - start_after)))::int AS seconds
      FROM pgboss_email_pending_test.job WHERE name = ${EMAIL_QUEUE} AND data->>'subject' LIKE 'Süre %' ORDER BY 1`;
    expect(Object.fromEntries(rows.map((row) => [row.subject, row.seconds]))).toEqual({
      'Süre bildirim': EMAIL_PENDING_RETENTION_SECONDS,
      'Süre doğrulama': EMAIL_SECURITY_RETENTION_SECONDS,
      'Süre giriş': EMAIL_SECURITY_RETENTION_SECONDS,
      'Süre test': EMAIL_PENDING_RETENTION_SECONDS,
    });
  });

  it('işçi kapalıyken bekleyen e-postalar bakım silmesinden sağ çıkar ve işçi açılınca bir kez gönderilir', async () => {
    // Kısaltılmış süre: güvenlik bağlantısı 3 sn, bildirim 60 sn. İşçi yokken bakım çalışır; bağlantı silinir, bildirimler kalır.
    const producer = await createEmailQueue(url, { schema: SCHEMA });
    bosses.push(producer);
    const transport = new FakeEmailTransport();
    const service = createEmailService(
      createEmailOutbox(db, producer, { pending: 60, security: 3 }),
      transport,
      () => undefined,
    );
    const link = await service.enqueueEmail(message('auth.sign-in-link', 'Birikim bağlantı'));
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const sent = await service.enqueueEmail(
        message('contact.requested', `Birikim bildirim ${i}`),
      );
      ids.push(sent.emailLogId!);
    }
    expect(await jobs('Birikim')).toHaveLength(13);
    expect(transport.sent).toHaveLength(0);

    // İşçi kapalı: yalnız bakım (supervise) çalışır, tüketici yok.
    const maintenance = await createEmailQueue(url, { schema: SCHEMA, supervise: true });
    bosses.push(maintenance);
    expect(
      await until(async () => (await jobs('Birikim bağlantı')).length === 0, 30),
      'bakım süresi dolan güvenlik bağlantısını silmedi (bakım çalışmıyor)',
    ).toBe(true);
    const waiting = await jobs('Birikim bildirim');
    expect(waiting).toHaveLength(12);
    expect(new Set(waiting.map((job) => job.state))).toEqual(new Set(['created']));

    // İşçi açılır: bütün bildirimler bir kez gönderilir.
    await startEmailConsumer(maintenance, service.deliver);
    expect(
      await until(
        async () =>
          (await db.emailLog.count({ where: { id: { in: ids }, status: 'SENT' } })) === ids.length,
        40,
      ),
      'bekleyen bildirimler işçi açılınca gönderilmedi',
    ).toBe(true);
    const subjects = transport.sent.map((delivery) => delivery.subject);
    expect(subjects.filter((subject) => subject.startsWith('Birikim bildirim'))).toHaveLength(12);
    expect(new Set(subjects).size).toBe(subjects.length);
    expect(subjects).not.toContain('Birikim bağlantı');
    // Süresi dolan güvenlik bağlantısı gönderilmez; kaydı QUEUED kalır (kısa ömürlü bağlantı zaten geçersiz olurdu).
    const linkRow = await db.emailLog.findUniqueOrThrow({ where: { id: link.emailLogId! } });
    expect(linkRow.status).toBe('QUEUED');
  }, 90_000);
});
