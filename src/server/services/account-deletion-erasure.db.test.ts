import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { createTestPrisma } from '@/test/db';
import { addGrant, addMembership, createInstitution, createUser } from '@/test/fixtures';
import { encryptSecret } from '../crypto/secret-box';
import { createGoogleCalendar, resetCalendar, getCalendar } from '../external/calendar';
import { FakeEmailTransport } from '../external/email/fake';
import { createEmailOutbox } from '../jobs/email-outbox';
import { createEmailService, type QueuedEmail } from '../jobs/email-core';
import { createEmailQueue, EMAIL_QUEUE } from '../jobs/email-queue';
import { decideNotification } from './notification-preferences';
import { createGoogleTokenStore, revokeErasedGoogleToken } from './google-calendar-connection';
import { deleteAccount, ERASED_GOOGLE_TOKEN, ERASED_PERSONAL_TEXT } from './accountDeletion';

const db = createTestPrisma();
const secret = 'synthetic-key-for-account-erasure-tests-only';
const context = 'IntegrationConnection:GOOGLE_CALENDAR:refreshToken';
let boss: PgBoss;
beforeAll(async () => {
  boss = await createEmailQueue(process.env.DATABASE_URL_TEST!);
});
afterAll(async () => {
  if (boss) await boss.stop({ graceful: true, timeout: 5000 });
  await db.$disconnect();
  vi.unstubAllEnvs();
  resetCalendar();
});

/** R1 sentinel yöntemi: kendi test DB'sindeki bütün metin/JSON/uuid sütunları; yalnız eşleşme sayısı. */
async function sentinelCount(needle: string) {
  const columns = await db.$queryRaw<
    Array<{ table_schema: string; table_name: string; column_name: string }>
  >`
    SELECT table_schema, table_name, column_name FROM information_schema.columns
    WHERE table_schema IN ('public', 'pgboss') AND udt_name IN ('text','varchar','json','jsonb','uuid','_text')`;
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  let count = 0;
  for (const col of columns) {
    const [row] = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM ${quote(col.table_schema)}.${quote(col.table_name)} WHERE position($1 in ${quote(col.column_name)}::text)>0`,
      needle,
    );
    count += Number(row!.n);
  }
  return count;
}

it.each(['STUDENT', 'ALUMNI', 'ACADEMIC', 'SYSTEM'] as const)(
  '%s: kişisel metinler/bağlantı/bekleyen e-posta aynı silmede temizlenir; sentinel 0',
  async (role) => {
    const tag = `k366-${randomUUID()}`,
      email = `${tag}@example.invalid`;
    const owner = await createUser(db, { email, name: tag });
    const other = await createUser(db);
    const { deptA1 } = await createInstitution(db);
    if (role === 'SYSTEM') await addGrant(db, { userId: owner, scope: 'SYSTEM' });
    else await addMembership(db, { userId: owner, role, departmentId: deptA1 });
    await db.user.update({ where: { id: owner }, data: { banReason: tag } });
    const document = await db.graduationDocument.create({
      data: {
        userId: owner,
        departmentId: deptA1,
        graduationYear: 2024,
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: other,
        rejectReason: tag,
      },
    });
    const posting = await db.jobPosting.create({
      data: {
        authorId: other,
        departmentIdAtWrite: deptA1,
        kind: 'INTERNSHIP',
        title: 'Örnek ilan',
      },
    });
    const report = await db.jobPostingReport.create({
      data: { postingId: posting.id, reporterId: owner, reason: tag },
    });
    for (const source of ['PROFILE', 'JOB_POSTING', 'SEEKER_PROFILE'] as const) {
      await db.contactRequest.create({
        data: {
          requesterId: owner,
          targetId: other,
          source,
          fields: ['EMAIL'],
          message: tag,
          ...(source === 'PROFILE' ? {} : { sourceTitle: tag, sourceOrganization: tag }),
        },
      });
    }
    const incoming = await db.contactRequest.create({
      data: {
        requesterId: other,
        targetId: owner,
        fields: ['EMAIL'],
        message: 'Karşı tarafın kendi iletisi',
      },
    });
    const encrypted = encryptSecret(`${tag}-token`, secret, context);
    await db.integrationConnection.upsert({
      where: { provider: 'GOOGLE_CALENDAR' },
      create: {
        provider: 'GOOGLE_CALENDAR',
        refreshTokenEnc: encrypted,
        accountLabel: tag,
        scope: 'calendar.events',
        connectedById: owner,
      },
      update: {
        refreshTokenEnc: encrypted,
        accountLabel: tag,
        status: 'ACTIVE',
        connectedById: owner,
      },
    });
    const sent = new FakeEmailTransport();
    const service = createEmailService(createEmailOutbox(db, boss), sent, vi.fn(), (m) =>
      decideNotification(db, m),
    );
    const input: QueuedEmail = {
      to: email,
      subject: 'Örnek',
      text: tag,
      template: 'auth.sign-in-link',
      idempotencyKey: randomUUID(),
    };
    const { emailLogId } = await service.enqueueEmail(input);
    expect(await db.emailLog.findUniqueOrThrow({ where: { id: emailLogId! } })).toMatchObject({
      status: 'QUEUED',
      recipientUserId: owner,
    });
    const before = await sentinelCount(tag);
    expect(before).toBeGreaterThan(8);
    vi.stubEnv('CALENDAR_PROVIDER', 'fake');
    const oldCalendar = getCalendar();
    expect(oldCalendar).not.toBeNull();
    const revoke = vi.fn(async (token: string) => {
      expect(token).toBe(encrypted);
      expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).deletedAt).not.toBeNull();
      throw new Error('synthetic network failure');
    });
    await deleteAccount(
      db,
      owner,
      { confirmEmail: email, publishedContent: role === 'ALUMNI' ? 'ANONYMIZE' : 'DELETE' },
      { removeStoredFiles: null, revokeCalendarToken: revoke },
    );
    expect(revoke).toHaveBeenCalledOnce();
    expect(getCalendar()).not.toBe(oldCalendar);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).banReason).toBeNull();
    expect(
      (await db.graduationDocument.findUniqueOrThrow({ where: { id: document.id } })).rejectReason,
    ).toBe(ERASED_PERSONAL_TEXT);
    expect(await db.jobPostingReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject(
      { reporterId: null, reason: ERASED_PERSONAL_TEXT },
    );
    const outgoing = await db.contactRequest.findMany({ where: { requesterId: owner } });
    expect(outgoing).toHaveLength(3);
    for (const row of outgoing) {
      expect(row.message).toBeNull();
      expect(row.sourceTitle).toBe(row.source === 'PROFILE' ? null : ERASED_PERSONAL_TEXT);
      expect(row.sourceOrganization).toBe(row.source === 'PROFILE' ? null : ERASED_PERSONAL_TEXT);
    }
    expect(
      (await db.contactRequest.findUniqueOrThrow({ where: { id: incoming.id } })).message,
    ).toBe('Karşı tarafın kendi iletisi');
    expect(
      await db.integrationConnection.findUniqueOrThrow({ where: { provider: 'GOOGLE_CALENDAR' } }),
    ).toMatchObject({
      status: 'NEEDS_RECONNECT',
      refreshTokenEnc: ERASED_GOOGLE_TOKEN,
      accountLabel: null,
    });
    expect(await createGoogleTokenStore(db, secret).loadRefreshToken()).toBeNull();
    expect(await db.emailLog.findUniqueOrThrow({ where: { id: emailLogId! } })).toMatchObject({
      status: 'FAILED',
      errorCode: 'EMAIL_RECIPIENT_INELIGIBLE',
    });
    await service.deliver(input, 0, 2);
    expect(sent.sent).toHaveLength(0);
    const after = await sentinelCount(tag);
    expect(after).toBe(0);
    console.info(`[kvkk-sentinel] ${role}: ${before} → ${after}`);
  },
);

it('eski kimliksiz giriş işi adresle iptal edilir; yabancı alıcı ve bağlantı korunur', async () => {
  const owner = await createUser(db),
    other = await createUser(db);
  const email = (await db.user.findUniqueOrThrow({ where: { id: owner } })).email;
  const input: QueuedEmail = {
    to: email,
    subject: 'Örnek',
    text: 'Gizli bağlantı',
    template: 'auth.sign-in-link',
    idempotencyKey: randomUUID(),
  };
  const log = await db.emailLog.create({
    data: { template: input.template, idempotencyKey: input.idempotencyKey },
  });
  await boss.send(EMAIL_QUEUE, input, { id: log.id });
  const foreign = await db.emailLog.create({
    data: { recipientUserId: other, template: 'auth.sign-in-link', idempotencyKey: randomUUID() },
  });
  await db.integrationConnection.upsert({
    where: { provider: 'GOOGLE_CALENDAR' },
    create: {
      provider: 'GOOGLE_CALENDAR',
      connectedById: other,
      refreshTokenEnc: encryptSecret('other-token', secret, context),
      accountLabel: 'Other synthetic label',
      scope: 'calendar.events',
    },
    update: {
      connectedById: other,
      refreshTokenEnc: encryptSecret('other-token', secret, context),
      accountLabel: 'Other synthetic label',
      status: 'ACTIVE',
    },
  });
  const revoke = vi.fn();
  await deleteAccount(
    db,
    owner,
    { confirmEmail: email, publishedContent: 'DELETE' },
    { removeStoredFiles: null, revokeCalendarToken: revoke },
  );
  expect((await db.emailLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe('FAILED');
  expect((await db.emailLog.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe(
    'QUEUED',
  );
  expect(
    (await db.integrationConnection.findUniqueOrThrow({ where: { provider: 'GOOGLE_CALENDAR' } }))
      .status,
  ).toBe('ACTIVE');
  expect(revoke).not.toHaveBeenCalled();
  const transport = new FakeEmailTransport();
  await createEmailService(createEmailOutbox(db, boss), transport).deliver(input, 0, 2);
  expect(transport.sent).toHaveLength(0);
});

it('zorunlu güvenlik iletisi de silinmiş alıcıya reddedilir; yeni adres doğrulaması ve bilinmeyen adres korunur', async () => {
  const owner = await createUser(db);
  const msg: QueuedEmail = {
    to: 'new-address@example.invalid',
    subject: 'Örnek',
    text: 'Örnek',
    template: 'auth.change-email-verification',
    idempotencyKey: randomUUID(),
    recipientUserId: owner,
  };
  expect(await decideNotification(db, msg)).toEqual({ send: true });
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  expect(await decideNotification(db, msg)).toEqual({
    send: false,
    errorCode: 'EMAIL_RECIPIENT_INELIGIBLE',
  });
  const transport = new FakeEmailTransport(),
    service = createEmailService(createEmailOutbox(db, boss), transport, vi.fn(), (m) =>
      decideNotification(db, m),
    );
  expect(await service.enqueueEmail(msg)).toEqual({ emailLogId: null });
  const unknown = {
    ...msg,
    template: 'auth.sign-in-link',
    recipientUserId: undefined,
    idempotencyKey: randomUUID(),
  };
  const queued = await service.enqueueEmail(unknown);
  expect(queued.emailLogId).not.toBeNull();
  await service.deliver(unknown, 0, 2);
  expect(transport.sent).toHaveLength(1);
});

it('Google sağlayıcı iptali sahte taşıma ile denenir; hata ve çözülemeyen jeton silmeyi engellemez', async () => {
  const token = encryptSecret('synthetic-refresh-token', secret, context);
  const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic network error'));
  const settings = () => ({
    mode: 'GOOGLE' as const,
    clientId: 'synthetic',
    clientSecret: 'synthetic',
    appUrl: 'http://127.0.0.1:3000',
    secret,
  });
  await expect(revokeErasedGoogleToken(token, { settings, fetchImpl })).resolves.toBeUndefined();
  expect(fetchImpl).toHaveBeenCalledOnce();
  await expect(
    revokeErasedGoogleToken(ERASED_GOOGLE_TOKEN, { settings, fetchImpl }),
  ).resolves.toBeUndefined();
  expect(fetchImpl).toHaveBeenCalledOnce();
});

function barrier() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
async function waitingForUserLock(kind: 'SHARE' | 'UPDATE') {
  await vi.waitFor(
    async () => {
      const [row] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database()
      AND wait_event_type='Lock' AND query LIKE ${`SELECT "id" FROM "User"%FOR ${kind}%`}`;
      expect(Number(row!.n)).toBeGreaterThan(0);
    },
    { timeout: 3000, interval: 10 },
  );
}
it('teslim önce kilit alırsa silme SMTP bitişini bekler; silmeden sonra SENT yazımı yoktur', async () => {
  const owner = await createUser(db),
    email = (await db.user.findUniqueOrThrow({ where: { id: owner } })).email;
  const entered = barrier(),
    finish = barrier();
  const send = vi.fn(async () => {
    entered.release();
    await finish.wait;
  });
  const service = createEmailService(
    createEmailOutbox(db, boss),
    { send, close() {} },
    vi.fn(),
    (m) => decideNotification(db, m),
  );
  const input: QueuedEmail = {
    to: email,
    subject: 'Örnek',
    text: 'Örnek',
    template: 'auth.sign-in-link',
    idempotencyKey: randomUUID(),
  };
  const { emailLogId } = await service.enqueueEmail(input);
  const delivery = service.deliver(input, 0, 2);
  await entered.wait;
  const deletion = deleteAccount(
    db,
    owner,
    { confirmEmail: email, publishedContent: 'DELETE' },
    { removeStoredFiles: null },
  );
  try {
    await waitingForUserLock('UPDATE');
  } finally {
    finish.release();
    await Promise.all([delivery, deletion]);
  }
  expect(send).toHaveBeenCalledOnce();
  expect((await db.emailLog.findUniqueOrThrow({ where: { id: emailLogId! } })).status).toBe('SENT');
  expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).deletedAt).not.toBeNull();
});
it('silme önce kilit alırsa teslim commit sonrasına kadar bekler ve SMTP çağırmaz', async () => {
  const owner = await createUser(db),
    email = (await db.user.findUniqueOrThrow({ where: { id: owner } })).email;
  const entered = barrier(),
    finish = barrier();
  const transport = new FakeEmailTransport();
  const service = createEmailService(createEmailOutbox(db, boss), transport, vi.fn(), (m) =>
    decideNotification(db, m),
  );
  const input: QueuedEmail = {
    to: email,
    subject: 'Örnek',
    text: 'Örnek',
    template: 'auth.sign-in-link',
    idempotencyKey: randomUUID(),
  };
  const { emailLogId } = await service.enqueueEmail(input);
  const deletion = deleteAccount(
    db,
    owner,
    { confirmEmail: email, publishedContent: 'DELETE' },
    {
      removeStoredFiles: null,
      handlers: [
        async () => {
          entered.release();
          await finish.wait;
        },
      ],
    },
  );
  await entered.wait;
  const delivery = service.deliver(input, 0, 2);
  try {
    await waitingForUserLock('SHARE');
  } finally {
    finish.release();
    await Promise.all([delivery, deletion]);
  }
  expect(transport.sent).toHaveLength(0);
  expect((await db.emailLog.findUniqueOrThrow({ where: { id: emailLogId! } })).status).toBe(
    'FAILED',
  );
});

it('ayrı süreçte önceden önbelleklenmiş Google erişimi, hesap silme sonrası sağlayıcıya çıkmaz', async () => {
  const owner = await createUser(db),
    email = (await db.user.findUniqueOrThrow({ where: { id: owner } })).email;
  const data = {
    connectedById: owner,
    refreshTokenEnc: encryptSecret('synthetic-refresh-token', secret, context),
    scope: 'calendar.events',
    status: 'ACTIVE' as const,
  };
  await db.integrationConnection.upsert({
    where: { provider: 'GOOGLE_CALENDAR' },
    create: { provider: 'GOOGLE_CALENDAR', ...data },
    update: data,
  });
  const store = createGoogleTokenStore(db, secret);
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).includes('oauth2.googleapis.com/token')
        ? Response.json({ access_token: 'synthetic-access-token', expires_in: 3600 })
        : new Response(null, { status: 204 }),
    );
  // Yerel resetCalendar'ın erişemediği, başka süreçte tutulmuş gibi bağımsız adaptör.
  const calendar = createGoogleCalendar({
    clientId: 'synthetic',
    clientSecret: 'synthetic',
    loadRefreshToken: store.loadRefreshToken,
    isConnected: store.isConnected,
    onTokenRejected: store.markRejected,
    fetchImpl,
  });
  await calendar.deleteEvent('synthetic-event');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  await deleteAccount(
    db,
    owner,
    { confirmEmail: email, publishedContent: 'DELETE' },
    {
      removeStoredFiles: null,
      revokeCalendarToken: async () => {
        throw new Error('synthetic offline');
      },
    },
  );
  await expect(calendar.deleteEvent('synthetic-event')).rejects.toMatchObject({
    code: 'CALENDAR_NOT_CONNECTED',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
