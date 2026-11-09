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
import { finalizeDuePoints } from './points';
import { decideSuspicion } from './points-admin';
import { runSuspicionScan } from './points-scan';
import {
  checkInCampusEvent,
  createCampusEvent,
  registerCampusEvent,
  reviewCampusEvent,
} from './campus-event';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const secret = 'test-review-event-secret';
async function fixture() {
  await seedPointRules(db);
  const inst = await createInstitution(db),
    admin = await createUser(db),
    people = await Promise.all([0, 1, 2].map(() => createUser(db)));
  for (const userId of [admin, ...people]) {
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await grantRequiredConsents(db, userId);
  }
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  return { inst, admin, people };
}
async function event(w: Awaited<ReturnType<typeof fixture>>, at: Date) {
  const deps = { db, now: () => new Date(+at - 60000) },
    e = await createCampusEvent(deps, w.admin, {
      title: 'İnceleme buluşması',
      description: 'Bağımsız katılım denemesi',
      location: 'Kampüs',
      startsAt: at.toISOString(),
      endsAt: new Date(+at + 3600000).toISOString(),
      capacity: 10,
      departmentIds: [w.inst.deptA1],
    });
  await reviewCampusEvent(deps, w.admin, {
    eventId: e.id,
    decision: 'PUBLISH',
    reason: 'İncelemeye uygun',
  });
  for (const userId of w.people) await registerCampusEvent(deps, userId, { eventId: e.id });
  return e.id;
}
const check = (id: string, userId: string, at: Date, ip: string | null = null) =>
  checkInCampusEvent(
    { db, now: () => at },
    userId,
    { eventId: id, code: campusEventCode(id, secret, at).code },
    secret,
    ip,
  );
it('aynı kişinin eşzamanlı katılımı tek kayıt/puan; geçersiz, eski ve pencere dışı kod aynı yanıt', async () => {
  const w = await fixture(),
    at = new Date('2031-06-01T10:00:00Z'),
    id = await event(w, at),
    user = w.people[0]!;
  expect(await Promise.all([check(id, user, at), check(id, user, at)])).toEqual([
    { accepted: true },
    { accepted: true },
  ]);
  expect(await db.eventAttendance.count({ where: { eventId: id, userId: user } })).toBe(1);
  expect(await db.pointEntry.count({ where: { sourceId: id, userId: user } })).toBe(1);
  const other = w.people[1]!,
    later = new Date(+at + 120000),
    bad = campusEventCode(id, secret, at).code;
  for (const [eventId, code, now] of [
    [id, bad, later],
    [id, 'bad', at],
    [id, campusEventCode(id, secret, new Date(+at - 1)).code, new Date(+at - 1)],
    [id, campusEventCode(id, secret, new Date(+at + 3600000)).code, new Date(+at + 3600000)],
  ] as const)
    expect(
      await checkInCampusEvent({ db, now: () => now }, other, { eventId, code }, secret, null),
    ).toEqual({ accepted: false });
});
it('farklı iki etkinlik yarışı aylık dördüncü puan hakkını yalnız birine verir', async () => {
  const w = await fixture(),
    user = w.people[0]!;
  for (let day = 1; day <= 3; day++) {
    const at = new Date(`2031-07-0${day}T10:00:00Z`),
      id = await event(w, at);
    await check(id, user, at);
  }
  const at = new Date('2031-07-04T10:00:00Z'),
    a = await event(w, at),
    b = await event(w, at);
  expect(await Promise.all([check(a, user, at), check(b, user, at)])).toEqual([
    { accepted: true },
    { accepted: true },
  ]);
  const points = await db.pointEntry.findMany({
    where: { userId: user, action: 'EVENT_ATTENDED' },
    orderBy: { multiplierPercent: 'desc' },
  });
  expect(points.map((p) => p.points)).toEqual([5, 5, 5, 5, 0]);
  expect(
    points.every(
      (p) =>
        p.status === 'PENDING' && p.finalizesAt?.getTime() === p.eventAt.getTime() + 3 * 86400000,
    ),
  ).toBe(true);
});
it('açık işaret varken ikinci etkinliğin şüphesi ilk karar sonrasında yeniden taranır', async () => {
  const w = await fixture(),
    first = new Date('2031-08-01T10:00:00Z'),
    second = new Date('2031-08-02T10:00:00Z'),
    a = await event(w, first),
    b = await event(w, second);
  for (const user of w.people) await check(a, user, first, '192.0.2.77');
  for (const user of w.people) await check(b, user, second, '192.0.2.77');
  const user = w.people[0]!,
    flags = await db.suspicionFlag.findMany({ where: { userId: user, status: 'OPEN' } });
  for (const flag of flags)
    await decideSuspicion({ db, now: () => new Date(+second + 1000) }, w.admin, {
      flagId: flag.id,
      decision: 'CONFIRM',
      reason: 'İlk kanıt doğrulandı',
    });
  const next = new Date(+second + 4 * 86400000);
  // Kesinleştirme cron'u taramadan önce çalışsa da kalan kanıt korunmalı.
  await finalizeDuePoints({ db, now: () => next });
  const point = await db.pointEntry.findFirstOrThrow({ where: { userId: user, sourceId: b } });
  expect(point.status).toBe('PENDING');
  expect(
    await db.suspicionFlag.count({
      where: { userId: user, status: 'OPEN', entryIds: { has: point.id } },
    }),
  ).toBeGreaterThan(0);
  const before = await db.suspicionFlag.count({ where: { userId: user, status: 'OPEN' } });
  await runSuspicionScan({ db, now: () => next });
  expect(await db.suspicionFlag.count({ where: { userId: user, status: 'OPEN' } })).toBe(before);
  const remaining = await db.suspicionFlag.findMany({ where: { userId: user, status: 'OPEN' } });
  expect(
    remaining.every((flag) => +flag.windowStart === +second && +flag.windowEnd === +second),
  ).toBe(true);
  for (const flag of remaining)
    await decideSuspicion({ db, now: () => next }, w.admin, {
      flagId: flag.id,
      decision: 'CONFIRM',
      reason: 'Kalan kanıt doğrulandı',
    });
  expect(await db.pointEntry.findUnique({ where: { id: point.id } })).toMatchObject({
    status: 'REVOKED',
    revokedReason: 'FRAUD_CONFIRMED',
  });
});
