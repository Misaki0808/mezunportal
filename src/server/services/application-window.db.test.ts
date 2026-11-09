import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { buildDataExport } from './dataExport';
import { deleteAccount } from './accountDeletion';
import { getExperienceDetail, getOwnAppliedMonth, saveExperienceDraft } from './experience';
import { maySendNotification } from './notification-preferences';
import { scheduleApplicationWindows } from '../jobs/application-window-task';
import { sendNotificationIntent } from '../jobs/notification-intent-worker';
import { getApplicationCalendar, setApplicationFollow } from './application-window';

const db = createTestPrisma();
const mail = vi.hoisted(() => vi.fn().mockResolvedValue({ emailLogId: 'queued-email' }));
vi.mock('../jobs/email', () => ({ enqueueEmail: mail }));
afterAll(() => db.$disconnect());
const monthStart = new Date('2026-02-28T21:00:00Z');
async function fixture() {
  const institute = await createInstitution(db);
  const other = await createInstitution(db);
  const student = await createUser(db);
  await addMembership(db, {
    userId: student,
    departmentId: institute.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, student);
  const key = randomUUID();
  const sector = await db.sector.create({ data: { name: `Sektör ${key}`, normalizedName: key } });
  const company = await db.company.create({
    data: { name: `Şirket ${key}`, normalizedName: key, aliases: [], sectorId: sector.id },
  });
  const moderator = await createUser(db);
  const authors = [student, await createUser(db), await createUser(db)];
  for (const userId of authors.slice(1))
    await addMembership(db, {
      userId,
      departmentId: institute.deptA1,
      role: 'STUDENT',
      entryYear: 2023,
    });
  return { institute, other, student, company, sector, moderator, authors };
}
async function add(
  w: Awaited<ReturnType<typeof fixture>>,
  authorId: string,
  options: { anonymous?: boolean; departmentId?: string; appliedMonth?: number | null } = {},
) {
  return db.experience.create({
    data: {
      authorId,
      departmentIdAtWrite: options.departmentId ?? w.institute.deptA1,
      companyId: w.company.id,
      type: 'INTERNSHIP',
      organizationName: w.company.name,
      termYear: 2025,
      termSeason: 'SPRING',
      appliedMonth: options.appliedMonth === undefined ? 3 : options.appliedMonth,
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      status: 'PUBLISHED',
      moderatedAt: new Date(),
      moderatedById: w.moderator,
      publishedAt: new Date(),
      isAnonymous: options.anonymous ?? false,
      whatLearned: 'Öğrendim',
      advice: 'Çalışın',
    },
    select: { id: true },
  });
}
it('K-07, üç farklı yazar, anonim kesişimi ve tekil ay gizliliği', async () => {
  const w = await fixture();
  const scope = { kind: 'COMPANY' as const, id: w.company.id };
  const one = await add(w, w.authors[0]!);
  await add(w, w.authors[1]!);
  const foreign = await createUser(db);
  await add(w, foreign, { departmentId: w.other.deptA1 });
  expect((await getApplicationCalendar(db, w.student, scope, monthStart)).months).toEqual([]);
  await add(w, w.authors[2]!, { appliedMonth: null });
  expect((await getApplicationCalendar(db, w.student, scope, monthStart)).months).toEqual([
    { month: 3, count: 3 },
  ]);
  await db.user.update({ where: { id: w.authors[1]! }, data: { banned: true } });
  expect((await getApplicationCalendar(db, w.student, scope, monthStart)).months).toEqual([]);
  await db.user.update({ where: { id: w.authors[1]! }, data: { banned: false } });
  const detail = await getExperienceDetail(db, w.student, { experienceId: one.id });
  expect(JSON.stringify(detail)).not.toContain('appliedMonth');
  const exported = await buildDataExport(db, w.student);
  expect(exported.experiences.find((item) => item.id === one.id)?.appliedMonth).toBe(3);
  const anonymous = await createUser(db);
  await add(w, anonymous, { anonymous: true });
  expect((await getApplicationCalendar(db, w.student, scope, monthStart)).months).toEqual([]);
});
it('ay başında yalnız etkin takipçi için tek niyet, kapalı tercih ve takibi bırakma teslimi engeller', async () => {
  const w = await fixture();
  const scope = { kind: 'COMPANY' as const, id: w.company.id };
  for (const author of w.authors) await add(w, author);
  await setApplicationFollow(db, w.student, { scope, following: true }, monthStart);
  await setApplicationFollow(db, w.student, { scope, following: true }, monthStart);
  expect(await db.companyFollow.count({ where: { userId: w.student } })).toBe(1);
  expect((await buildDataExport(db, w.student)).companyFollows).toEqual([
    expect.objectContaining({ companyId: w.company.id, sectorId: null }),
  ]);
  expect(await scheduleApplicationWindows(db, new Date('2026-02-28T20:59:59Z'))).toBe(0);
  await scheduleApplicationWindows(db, monthStart);
  await scheduleApplicationWindows(db, monthStart);
  expect(
    await db.notificationIntent.count({ where: { userId: w.student, kind: 'applicationWindow' } }),
  ).toBe(1);
  const intent = await db.notificationIntent.findFirstOrThrow({
    where: { userId: w.student, kind: 'applicationWindow' },
    select: { id: true, userId: true, payload: true },
  });
  await sendNotificationIntent(db, intent, monthStart);
  await sendNotificationIntent(db, intent, monthStart);
  expect(mail).toHaveBeenCalledTimes(1);
  expect(mail).toHaveBeenCalledWith(
    expect.objectContaining({ template: 'applicationWindow.reminder', recipientUserId: w.student }),
  );
  const user = await db.user.findUniqueOrThrow({
    where: { id: w.student },
    select: { email: true },
  });
  const email = {
    to: user.email,
    recipientUserId: w.student,
    subject: 'Hatırlatma',
    text: 'Takvim',
    template: 'applicationWindow.reminder',
    idempotencyKey: `application-window:${w.student}:2026-03`,
  };
  expect(await maySendNotification(db, email, monthStart)).toBe(true);
  await db.notificationPreference.upsert({
    where: { userId_type: { userId: w.student, type: 'APPLICATION_WINDOW' } },
    create: { userId: w.student, type: 'APPLICATION_WINDOW', enabled: false },
    update: { enabled: false },
  });
  expect(await maySendNotification(db, email, monthStart)).toBe(false);
  await db.notificationPreference.update({
    where: { userId_type: { userId: w.student, type: 'APPLICATION_WINDOW' } },
    data: { enabled: true },
  });
  await setApplicationFollow(db, w.student, { scope, following: false }, monthStart);
  expect(await maySendNotification(db, email, monthStart)).toBe(false);
  await setApplicationFollow(db, w.student, { scope, following: true }, monthStart);
  await db.notificationPreference.update({
    where: { userId_type: { userId: w.student, type: 'APPLICATION_WINDOW' } },
    data: { enabled: false },
  });
  await db.notificationIntent.deleteMany({
    where: { userId: w.student, kind: 'applicationWindow' },
  });
  await scheduleApplicationWindows(db, monthStart);
  expect(
    await db.notificationIntent.count({ where: { userId: w.student, kind: 'applicationWindow' } }),
  ).toBe(0);
});
it('taslak ayı yalnız sahibinin düzenleme verisine ve dökümüne girer', async () => {
  const w = await fixture();
  const input = {
    departmentId: w.institute.deptA1,
    content: { type: 'INTERNSHIP' as const },
    isAnonymous: true,
    appliedMonth: 4,
  };
  const created = await saveExperienceDraft(db, w.student, input);
  expect(JSON.stringify(created)).not.toContain('appliedMonth');
  expect(await getOwnAppliedMonth(db, w.student, { experienceId: created.id })).toEqual({
    appliedMonth: 4,
  });
  await grantRequiredConsents(db, w.authors[1]!);
  await expect(
    getOwnAppliedMonth(db, w.authors[1]!, { experienceId: created.id }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await saveExperienceDraft(db, w.student, {
    ...input,
    experienceId: created.id,
    appliedMonth: undefined,
  });
  expect(await getOwnAppliedMonth(db, w.student, { experienceId: created.id })).toEqual({
    appliedMonth: 4,
  });
  expect(
    (await buildDataExport(db, w.student)).experiences.find((entry) => entry.id === created.id)
      ?.appliedMonth,
  ).toBe(4);
});
it('ilan özetiyle paylaşılan günlük e-posta sınırı başvuru hatırlatmasını da durdurur', async () => {
  const w = await fixture();
  for (const author of w.authors) await add(w, author);
  await setApplicationFollow(
    db,
    w.student,
    { scope: { kind: 'COMPANY', id: w.company.id }, following: true },
    monthStart,
  );
  await scheduleApplicationWindows(db, monthStart);
  const intent = await db.notificationIntent.findFirstOrThrow({
    where: { userId: w.student, kind: 'applicationWindow' },
    select: { id: true, userId: true, payload: true },
  });
  await db.jobMatchDigest.create({ data: { userId: w.student, day: '2026-03-01' } });
  mail.mockClear();
  await sendNotificationIntent(db, intent, monthStart);
  expect(mail).not.toHaveBeenCalled();
  const second = await fixture();
  for (const author of second.authors) await add(second, author);
  await setApplicationFollow(
    db,
    second.student,
    { scope: { kind: 'COMPANY', id: second.company.id }, following: true },
    monthStart,
  );
  await scheduleApplicationWindows(db, monthStart);
  const weekly = await db.notificationIntent.findFirstOrThrow({
    where: { userId: second.student, kind: 'applicationWindow' },
    select: { id: true, userId: true, payload: true },
  });
  await db.jobMatchDigest.createMany({
    data: ['2026-02-24', '2026-02-26', '2026-02-28'].map((day) => ({
      userId: second.student,
      day,
    })),
  });
  await sendNotificationIntent(db, weekly, monthStart);
  expect(mail).not.toHaveBeenCalled();
});
it('hesap silmede takipler silinir ve anonim kalan deneyimden başvuru ayı temizlenir', async () => {
  const w = await fixture();
  const source = await add(w, w.student);
  await setApplicationFollow(
    db,
    w.student,
    { scope: { kind: 'COMPANY', id: w.company.id }, following: true },
    monthStart,
  );
  const user = await db.user.findUniqueOrThrow({
    where: { id: w.student },
    select: { email: true },
  });
  await deleteAccount(
    db,
    w.student,
    { publishedContent: 'ANONYMIZE', confirmEmail: user.email },
    { removeStoredFiles: null },
  );
  expect(await db.companyFollow.count({ where: { userId: w.student } })).toBe(0);
  const row = await db.experience.findUniqueOrThrow({
    where: { id: source.id },
    select: { appliedMonth: true, authorId: true, isAnonymous: true },
  });
  expect(row).toEqual({ appliedMonth: null, authorId: null, isAnonymous: true });
});
it('veritabanı takip hedefini ve ay sınırını doğrudan korur', async () => {
  const w = await fixture();
  await expect(db.companyFollow.create({ data: { userId: w.student } })).rejects.toThrow();
  await expect(
    db.companyFollow.create({
      data: { userId: w.student, companyId: w.company.id, sectorId: w.sector.id },
    }),
  ).rejects.toThrow();
  await expect(add(w, w.student, { appliedMonth: 13 })).rejects.toThrow();
});
