import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSECURE_DEV_AUTH_SECRET } from '@/lib/env';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { createPermissions } from '../permissions/guards';
import { getApplicationCalendar, setApplicationFollow } from './application-window';
import {
  getExperienceDetail,
  listMyExperiences,
  listModerationQueue,
  saveExperienceDraft,
  getOwnAppliedMonth,
} from './experience';
import { getCompany, companySlug, mergeCompanies } from './companies';
import { getInterviewQuestions } from './interview-questions';
import { searchExperiences } from './search';
import { buildDataExport } from './dataExport';
import { decideNotification, maySendNotification } from './notification-preferences';
import { scheduleApplicationWindows } from '../jobs/application-window-task';
import { sendNotificationIntent } from '../jobs/notification-intent-worker';
import { createEmailService, type QueuedEmail } from '../jobs/email-core';
import { createEmailOutbox } from '../jobs/email-outbox';
import { FakeEmailTransport } from '../external/email/fake';
const mail = vi.hoisted(() => vi.fn());
vi.mock('../jobs/email', () => ({ enqueueEmail: mail }));
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const START = new Date('2100-02-28T21:00:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries({
    APP_ENV: 'test',
    APP_URL: 'http://127.0.0.1:3999',
    BETTER_AUTH_SECRET: INSECURE_DEV_AUTH_SECRET,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    EMAIL_FROM: 'review@example.invalid',
    SMTP_USER: undefined,
    SMTP_PASSWORD: undefined,
    LINKEDIN_CLIENT_ID: undefined,
    LINKEDIN_CLIENT_SECRET: undefined,
  }))
    vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const inst = await createInstitution(db),
    student = await createUser(db),
    a = await createUser(db),
    b = await createUser(db),
    admin = await createUser(db);
  for (const userId of [student, a, b]) {
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await grantRequiredConsents(db, userId);
  }
  await addMembership(db, { userId: admin, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  await grantRequiredConsents(db, admin);
  const key = randomUUID(),
    sector = await db.sector.create({ data: { name: 'Örnek ' + key, normalizedName: key } }),
    company = await db.company.create({
      data: { name: 'Kurum ' + key, normalizedName: key, aliases: [], sectorId: sector.id },
    });
  const authors = [student, a, b];
  const rows = [];
  for (const authorId of authors)
    rows.push(
      await db.experience.create({
        data: {
          authorId,
          companyId: company.id,
          departmentIdAtWrite: inst.deptA1,
          organizationName: company.name,
          type: 'INTERNSHIP',
          termYear: 2025,
          termSeason: 'SPRING',
          appliedMonth: 3,
          durationWeeks: 8,
          pay: 'PAID',
          applicationChannel: 'REFERRAL',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          moderatedAt: new Date(),
          moderatedById: admin,
          whatLearned: 'Genel öğrenim',
          advice: 'Genel öneri',
          interviewQuestions: ['SQL nedir?'],
        },
        select: { id: true },
      }),
    );
  return {
    inst,
    student,
    admin,
    authors,
    company,
    sector,
    rows,
    scope: { kind: 'COMPANY' as const, id: company.id },
  };
}
function emailPort() {
  const published: QueuedEmail[] = [];
  const transport = new FakeEmailTransport();
  const send = vi.fn(async (_queue: unknown, input?: unknown) => {
    published.push(input as QueuedEmail);
    return randomUUID();
  });
  const service = createEmailService(
    createEmailOutbox(db, { send }),
    transport,
    () => {},
    (input) => decideNotification(db, input, START),
  );
  mail.mockImplementation((input: QueuedEmail) => service.enqueueEmail(input));
  return { service, published, transport, send };
}
function noPrivateMonth(value: unknown) {
  expect(JSON.stringify(value)).not.toContain('appliedMonth');
}

it('bütün tekil yansıtmalarda ay yok; sahip düzenleme/dökümüne var, başkasının özel isteği 404', async () => {
  const w = await fixture();
  const actor = await createPermissions({
    db: () => db,
    getSessionUserId: async () => w.student,
    now: () => new Date(),
  }).requireVerifiedMember();
  noPrivateMonth(await getExperienceDetail(db, w.authors[1]!, { experienceId: w.rows[0]!.id }));
  noPrivateMonth(await listMyExperiences(db, w.student, {}));
  noPrivateMonth(await getCompany({ db }, w.student, companySlug(w.company.name, w.company.id)));
  noPrivateMonth(
    await getInterviewQuestions(db, w.student, { companyId: w.company.id, sectorId: '', q: '' }),
  );
  noPrivateMonth(
    await searchExperiences({ db }, actor, { company: w.company.name, page: 1, pageSize: 20 }),
  );
  const draft = await saveExperienceDraft(db, w.student, {
    departmentId: w.inst.deptA1,
    content: { type: 'INTERNSHIP' },
    isAnonymous: true,
    appliedMonth: 7,
  });
  noPrivateMonth(draft);
  expect(await getOwnAppliedMonth(db, w.student, { experienceId: draft.id })).toEqual({
    appliedMonth: 7,
  });
  await expect(
    getOwnAppliedMonth(db, w.authors[1]!, { experienceId: draft.id }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await db.experience.update({
    where: { id: draft.id },
    data: {
      status: 'PENDING',
      organizationName: w.company.name,
      termYear: 2025,
      termSeason: 'SPRING',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      whatLearned: 'Genel öğrenim',
      advice: 'Genel öneri',
    },
  });
  noPrivateMonth(await listModerationQueue(db, w.admin, {}));
  expect(
    (await buildDataExport(db, w.student)).experiences.find((e) => e.id === w.rows[0]!.id)
      ?.appliedMonth,
  ).toBe(3);
});

it('aynı ayın eşzamanlı dört koşusu ve relay tekrarında gerçek outbox tek kayıt/tek teslim üretir', async () => {
  const w = await fixture(),
    port = emailPort();
  await setApplicationFollow(db, w.student, { scope: w.scope, following: true }, START);
  await setApplicationFollow(
    db,
    w.student,
    { scope: { kind: 'SECTOR', id: w.sector.id }, following: true },
    START,
  );
  for (let round = 0; round < 10; round++) {
    await db.notificationIntent.deleteMany({
      where: { userId: w.student, kind: 'applicationWindow' },
    });
    await Promise.all(Array.from({ length: 4 }, () => scheduleApplicationWindows(db, START)));
    expect(
      await db.notificationIntent.count({
        where: { userId: w.student, kind: 'applicationWindow' },
      }),
    ).toBe(1);
  }
  const intent = await db.notificationIntent.findFirstOrThrow({
    where: { userId: w.student, kind: 'applicationWindow' },
    select: { id: true, userId: true, payload: true },
  });
  await Promise.all(Array.from({ length: 4 }, () => sendNotificationIntent(db, intent, START)));
  expect(
    await db.emailLog.count({
      where: { recipientUserId: w.student, template: 'applicationWindow.reminder' },
    }),
  ).toBe(1);
  expect(port.published).toHaveLength(1);
  await port.service.deliver(port.published[0]!, 0, 3);
  await port.service.deliver(port.published[0]!, 0, 3);
  expect(port.transport.sent).toHaveLength(1);
  await db.notificationIntent.delete({ where: { id: intent.id } });
  await scheduleApplicationWindows(db, START);
  const recreated = await db.notificationIntent.findFirstOrThrow({
    where: { userId: w.student, kind: 'applicationWindow' },
    select: { id: true, userId: true, payload: true },
  });
  await sendNotificationIntent(db, recreated, START);
  expect(await db.emailLog.count({ where: { recipientUserId: w.student } })).toBe(1);
  expect(port.published).toHaveLength(1);
});

it('aşama sonrası tercih kapatma, takip kaldırma ve anonim kaynak teslimi durdurur', async () => {
  const w = await fixture(),
    port = emailPort();
  await setApplicationFollow(db, w.student, { scope: w.scope, following: true }, START);
  await scheduleApplicationWindows(db, START);
  const intent = await db.notificationIntent.findFirstOrThrow({
    where: { userId: w.student, kind: 'applicationWindow' },
    select: { id: true, userId: true, payload: true },
  });
  await db.notificationPreference.create({
    data: { userId: w.student, type: 'APPLICATION_WINDOW', enabled: false },
  });
  await sendNotificationIntent(db, intent, START);
  expect(port.published).toHaveLength(0);
  await db.notificationPreference.update({
    where: { userId_type: { userId: w.student, type: 'APPLICATION_WINDOW' } },
    data: { enabled: true },
  });
  await sendNotificationIntent(db, intent, START);
  expect(port.published).toHaveLength(1);
  await db.experience.update({ where: { id: w.rows[0]!.id }, data: { isAnonymous: true } });
  await port.service.deliver(port.published[0]!, 0, 3);
  expect(port.transport.sent).toHaveLength(0);
  expect(await db.emailLog.findFirst({ where: { recipientUserId: w.student } })).toMatchObject({
    status: 'FAILED',
    errorCode: 'APPLICATION_WINDOW_STALE',
  });
  await setApplicationFollow(db, w.student, { scope: w.scope, following: false }, START);
  expect(await maySendNotification(db, port.published[0]!, START)).toBe(false);
});

it('şirket birleşince çakışan takip tek hedefte kalır; aylar ve tekrar aynı hedefi kullanır', async () => {
  const w = await fixture(),
    target = await db.company.create({
      data: {
        name: 'Hedef ' + randomUUID(),
        normalizedName: randomUUID(),
        aliases: [],
        sectorId: w.sector.id,
      },
    });
  await setApplicationFollow(db, w.student, { scope: w.scope, following: true }, START);
  await setApplicationFollow(
    db,
    w.student,
    { scope: { kind: 'COMPANY', id: target.id }, following: true },
    START,
  );
  await mergeCompanies({ db }, w.admin, w.company.id, target.id);
  expect(await db.companyFollow.count({ where: { userId: w.student, companyId: target.id } })).toBe(
    1,
  );
  expect(
    await db.companyFollow.count({ where: { userId: w.student, companyId: w.company.id } }),
  ).toBe(0);
  expect(
    (await getApplicationCalendar(db, w.student, { kind: 'COMPANY', id: target.id }, START)).months,
  ).toEqual([{ month: 3, count: 3 }]);
  expect(await mergeCompanies({ db }, w.admin, w.company.id, target.id)).toEqual({
    targetId: target.id,
    alreadyMerged: true,
  });
});

it('teslimde süreli askı bitişi aynı enjekte edilen saate göre değerlendirilir', async () => {
  const w = await fixture();
  await setApplicationFollow(db, w.student, { scope: w.scope, following: true }, START);
  await db.user.update({ where: { id: w.student }, data: { banned: true, banExpires: START } });
  const user = await db.user.findUniqueOrThrow({ where: { id: w.student } });
  expect(
    await maySendNotification(
      db,
      {
        to: user.email,
        recipientUserId: w.student,
        template: 'applicationWindow.reminder',
        idempotencyKey: `application-window:${w.student}:2100-03`,
        subject: 'Takvim',
        text: 'Örnek',
      },
      START,
    ),
  ).toBe(true);
});
