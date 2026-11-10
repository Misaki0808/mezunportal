import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { seedPointRules } from '../../../prisma/seed-points';
import { campusEventCode } from '../rules/campus-event';
import { buildMonthlyDigest } from './monthly-digest';
import { buildDataExport } from './dataExport';
import { deleteAccount } from './accountDeletion';
import {
  cancelCampusEvent,
  checkInCampusEvent,
  createCampusEvent,
  getCampusEventCode,
  listCampusEvents,
  registerCampusEvent,
  reviewCampusEvent,
} from './campus-event';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('kapsam, kontenjan yarışı, kod dönemi ve iptal puanını korur', async () => {
  await seedPointRules(db);
  const inst = await createInstitution(db),
    admin = await createUser(db),
    one = await createUser(db),
    two = await createUser(db),
    outsider = await createUser(db);
  for (const [id, dept] of [
    [admin, inst.deptA1],
    [one, inst.deptA1],
    [two, inst.deptA1],
    [outsider, inst.deptB1],
  ] as const) {
    await addMembership(db, { userId: id, departmentId: dept, role: 'STUDENT', entryYear: 2024 });
    await grantRequiredConsents(db, id);
  }
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  const start = new Date('2030-01-01T10:00:00Z'),
    before = new Date(start.getTime() - 60_000),
    during = new Date(start.getTime() + 10_000);
  const event = await createCampusEvent({ db, now: () => before }, admin, {
    title: 'Kariyer buluşması',
    description: 'Mezunlarla kariyer buluşması',
    location: 'Kampüs',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3600_000).toISOString(),
    capacity: 1,
    departmentIds: [inst.deptA1],
  });
  await reviewCampusEvent({ db, now: () => before }, admin, {
    eventId: event.id,
    decision: 'PUBLISH',
    reason: 'Uygun etkinlik',
  });
  await expect(
    getCampusEventCode(
      { db, now: () => before },
      admin,
      { eventId: event.id },
      'secret',
      'https://portal.example',
    ),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const projection = await getCampusEventCode(
    { db, now: () => during },
    admin,
    { eventId: event.id },
    'secret',
    'https://portal.example',
  );
  expect(projection.qrSvg).toContain('<svg');
  await expect(
    getCampusEventCode(
      { db, now: () => during },
      outsider,
      { eventId: event.id },
      'secret',
      'https://portal.example',
    ),
  ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  expect(await listCampusEvents({ db, now: () => before }, outsider)).toEqual([]);
  expect((await buildMonthlyDigest(db, one, before))?.events).toEqual([
    { id: event.id, label: 'Kariyer buluşması' },
  ]);
  expect((await buildMonthlyDigest(db, outsider, before))?.events).toBeUndefined();
  const registrations = await Promise.allSettled([
    registerCampusEvent({ db, now: () => before }, one, { eventId: event.id }),
    registerCampusEvent({ db, now: () => before }, two, { eventId: event.id }),
  ]);
  expect(registrations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(registrations.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { code: 'CAMPUS_EVENT_CAPACITY_FULL' },
  });
  const registered = (
    await db.campusEventRegistration.findFirstOrThrow({ where: { eventId: event.id } })
  ).userId;
  const code = campusEventCode(event.id, 'secret', during).code;
  expect(
    await checkInCampusEvent(
      { db, now: () => before },
      registered,
      { eventId: event.id, code },
      'secret',
      null,
    ),
  ).toEqual({ accepted: false });
  expect(
    await checkInCampusEvent(
      { db, now: () => during },
      registered,
      { eventId: event.id, code },
      'secret',
      null,
    ),
  ).toEqual({ accepted: true });
  expect(
    await checkInCampusEvent(
      { db, now: () => during },
      registered,
      { eventId: event.id, code },
      'secret',
      null,
    ),
  ).toEqual({ accepted: true });
  expect(await db.eventAttendance.count({ where: { eventId: event.id } })).toBe(1);
  expect((await buildDataExport(db, registered)).campusEvents.attendances).toEqual([
    expect.objectContaining({ eventId: event.id }),
  ]);
  expect(
    await db.pointEntry.findFirst({ where: { userId: registered, sourceId: event.id } }),
  ).toMatchObject({ points: 5, status: 'PENDING' });
  await cancelCampusEvent({ db, now: () => during }, admin, {
    eventId: event.id,
    reason: 'Etkinlik iptal edildi',
  });
  expect(
    await db.pointEntry.findFirst({ where: { userId: registered, sourceId: event.id } }),
  ).toMatchObject({ status: 'REVOKED', revokedReason: 'EVENT_CANCELLED' });
  const user = await db.user.findUniqueOrThrow({
    where: { id: registered },
    select: { email: true },
  });
  await deleteAccount(
    db,
    registered,
    { publishedContent: 'ANONYMIZE', confirmEmail: user.email },
    { removeStoredFiles: null },
  );
  expect(await db.eventAttendance.count({ where: { userId: registered } })).toBe(0);
  expect(await db.campusEventRegistration.count({ where: { userId: registered } })).toBe(0);
});

it('beş deneme sınırı ve aynı saniye/ağ işaretleri katılımı iptal etmez', async () => {
  await seedPointRules(db);
  const inst = await createInstitution(db),
    admin = await createUser(db);
  await addMembership(db, {
    userId: admin,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, admin);
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  const start = new Date('2030-02-01T10:00:00Z'),
    before = new Date(start.getTime() - 1000),
    during = new Date(start.getTime() + 1000);
  const event = await createCampusEvent({ db, now: () => before }, admin, {
    title: 'Bölüm toplantısı',
    description: 'Bölüm üyelerinin buluşması',
    location: 'Kampüs',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3600_000).toISOString(),
    capacity: 10,
    departmentIds: [inst.deptA1],
  });
  await reviewCampusEvent({ db, now: () => before }, admin, {
    eventId: event.id,
    decision: 'PUBLISH',
    reason: 'Uygun etkinlik',
  });
  const people = [];
  for (let i = 0; i < 3; i++) {
    const userId = await createUser(db);
    people.push(userId);
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await grantRequiredConsents(db, userId);
    await registerCampusEvent({ db, now: () => before }, userId, { eventId: event.id });
  }
  const code = campusEventCode(event.id, 'secret', during).code;
  for (const userId of people)
    expect(
      await checkInCampusEvent(
        { db, now: () => during },
        userId,
        { eventId: event.id, code },
        'secret',
        '192.0.2.1',
      ),
    ).toEqual({ accepted: true });
  expect(
    await db.suspicionFlag.count({ where: { userId: { in: people }, rule: 'EVENT_BURST' } }),
  ).toBe(3);
  expect(
    await db.suspicionFlag.count({ where: { userId: { in: people }, rule: 'EVENT_NETWORK' } }),
  ).toBe(3);
  for (let i = 0; i < 4; i++)
    expect(
      await checkInCampusEvent(
        { db, now: () => during },
        people[0]!,
        { eventId: event.id, code: code === '000000' ? '000001' : '000000' },
        'secret',
        null,
      ),
    ).toEqual({ accepted: false });
  expect(
    await checkInCampusEvent(
      { db, now: () => during },
      people[0]!,
      { eventId: event.id, code },
      'secret',
      null,
    ),
  ).toEqual({ accepted: false });
});

it('aynı İstanbul ayında ilk dört etkinlik puan verir; beşinci sıfır çarpanla kaydedilir', async () => {
  await seedPointRules(db);
  const inst = await createInstitution(db),
    admin = await createUser(db),
    userId = await createUser(db);
  for (const id of [admin, userId]) {
    await addMembership(db, {
      userId: id,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await grantRequiredConsents(db, id);
  }
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  for (let day = 1; day <= 5; day++) {
    const start = new Date(`2030-03-0${day}T10:00:00Z`),
      before = new Date(start.getTime() - 1000),
      now = new Date(start.getTime() + 1000);
    const event = await createCampusEvent({ db, now: () => before }, admin, {
      title: 'Kariyer etkinliği',
      description: 'Bölüm üyelerinin buluşması',
      location: 'Kampüs',
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3600_000).toISOString(),
      capacity: 10,
      departmentIds: [inst.deptA1],
    });
    await reviewCampusEvent({ db, now: () => before }, admin, {
      eventId: event.id,
      decision: 'PUBLISH',
      reason: 'Uygun etkinlik',
    });
    await registerCampusEvent({ db, now: () => before }, userId, { eventId: event.id });
    const code = campusEventCode(event.id, 'secret', now).code;
    expect(
      await checkInCampusEvent(
        { db, now: () => now },
        userId,
        { eventId: event.id, code },
        'secret',
        null,
      ),
    ).toEqual({ accepted: true });
    expect(await db.pointEntry.findFirst({ where: { userId, sourceId: event.id } })).toMatchObject({
      status: 'PENDING',
      points: day <= 4 ? 5 : 0,
      multiplierPercent: day <= 4 ? 100 : 0,
      finalizesAt: new Date(now.getTime() + 3 * 86400_000),
    });
  }
});
