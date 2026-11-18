import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
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
import { decideNotification, maySendNotification } from './notification-preferences';

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
  for (const [key, value] of Object.entries({
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
});
afterEach(() => vi.unstubAllEnvs());
// İlk veritabanı turu (bağlantı ve ısınma) yük altında bir saniyeyi bulur; ilk testin payına değil kanca payına yazılsın.
beforeAll(() => db.$connect());
afterAll(() => db.$disconnect());

// Özet, bölümdeki bütün yayımlanmış deneyimleri sayar; ortak kurum testleri birbirine sızdırırdı (karışık sırada
// kırılır). Bu yüzden her test kendi kurumunu, kullanıcısını ve deneyimini kurar; hiçbir testin durumu sıraya bağlı değil.
async function createMember() {
  const institution = await createInstitution(db);
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, userId);
  return { userId, institution };
}

function publishExperience(authorId: string, departmentId: string, isAnonymous = false) {
  return db.experience.create({
    data: {
      authorId,
      departmentIdAtWrite: departmentId,
      type: 'INTERNSHIP',
      status: 'PUBLISHED',
      isAnonymous,
      moderatedAt: now,
      moderatedById: authorId,
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
}

/** Özeti dolu bir alıcı: kendi bölümünde tek (anonim) yayımlanmış deneyim var. */
async function createRecipient() {
  const { userId, institution } = await createMember();
  const author = await createUser(db);
  const row = await publishExperience(author, institution.deptA1, true);
  return { userId, institution, author, row };
}

/** Özeti dolu alıcı + ay başında çizelgelenmiş tek aylık özet niyeti. */
async function createRecipientWithIntent() {
  const recipient = await createRecipient();
  const { userId } = recipient;
  await scheduleMonthlyDigests(db, now, userId);
  const intent = await db.notificationIntent.findFirstOrThrow({
    where: { userId, kind: 'monthlyDigest' },
    select: { id: true, userId: true, payload: true },
  });
  return { ...recipient, intent };
}

function queuedDigestEmail(
  userEmail: string,
  userId: string,
  digest: NonNullable<Awaited<ReturnType<typeof buildMonthlyDigest>>>,
) {
  return decorateEmail(
    {
      ...monthlyDigestEmail(digest, userId, INSECURE_DEV_AUTH_SECRET, url),
      to: userEmail,
      recipientUserId: userId,
      template: 'monthlyDigest.summary',
      idempotencyKey: `monthly-digest:${userId}:2026-03`,
    },
    url,
  );
}

it('boş hesap niyet üretmez', async () => {
  const { userId } = await createMember();
  expect(await buildMonthlyDigest(db, userId, now)).toBeNull();
  await scheduleMonthlyDigests(db, now, userId);
  expect(await db.notificationIntent.count({ where: { userId, kind: 'monthlyDigest' } })).toBe(0);
});

it('anonim yazar gizli, kapsam dışı deneyim dışarıda', async () => {
  const { userId, author, row } = await createRecipient();
  const other = await createInstitution(db);
  await publishExperience(author, other.deptA1);
  const digest = await buildMonthlyDigest(db, userId, now);
  expect(digest?.experiences).toEqual([{ id: row.id, label: 'Staj' }]);
  expect(JSON.stringify(digest)).not.toContain(author);
});

it('aynı ay için tekrar çizelgeleme tek niyet üretir', async () => {
  const { userId } = await createRecipient();
  await scheduleMonthlyDigests(db, now, userId);
  await scheduleMonthlyDigests(db, now, userId);
  expect(await db.notificationIntent.count({ where: { userId, kind: 'monthlyDigest' } })).toBe(1);
});

it('son günlerde iş özeti gittiyse ya da ay başı iş özeti varsa aylık özet gitmez', async () => {
  const { userId, intent } = await createRecipientWithIntent();
  await db.jobMatchDigest.createMany({
    data: ['2026-02-24', '2026-02-25', '2026-02-26'].map((day) => ({ userId, day })),
  });
  await sendNotificationIntent(db, intent, now);
  expect(mail).not.toHaveBeenCalled();
  await db.jobMatchDigest.deleteMany({ where: { userId } });
  await db.jobMatchDigest.create({ data: { userId, day: '2026-03-01' } });
  await sendNotificationIntent(db, intent, now);
  expect(mail).not.toHaveBeenCalled();
});

it('kuyruk hatasında gün işareti kalır; yeniden denemede iki çağrı tek posta üretir', async () => {
  const { userId, intent } = await createRecipientWithIntent();
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
});

it('tercih kapalıyken özet gitmez; deneyim silinince kuyruktaki özet bayat sayılır', async () => {
  const { userId, row } = await createRecipient();
  const digest = await buildMonthlyDigest(db, userId, now);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const queued = queuedDigestEmail(user.email, userId, digest!);
  expect(await maySendNotification(db, queued, now)).toBe(true);
  await db.notificationPreference.upsert({
    where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
    create: { userId, type: 'MONTHLY_DIGEST', enabled: false },
    update: { enabled: false },
  });
  expect(await maySendNotification(db, queued, now)).toBe(false);
  expect(await decideNotification(db, queued, now)).toEqual({
    send: false,
    errorCode: 'EMAIL_PREFERENCE_DISABLED',
  });
  await db.notificationPreference.update({
    where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
    data: { enabled: true },
  });
  await db.experience.delete({ where: { id: row.id } });
  expect(await maySendNotification(db, queued, now)).toBe(false);
  // Parmak izinden ÖNCE kuyruğa alınmış kayıt (geçiş dönemi): eski metin denetimi, bayatsa DIGEST_STALE.
  expect(await decideNotification(db, queued, now)).toEqual({
    send: false,
    errorCode: 'DIGEST_STALE',
  });
});
