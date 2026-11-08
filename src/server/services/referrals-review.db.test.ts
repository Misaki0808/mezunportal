import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  createInstitution,
  createUser,
  addMembership,
  addGrant,
  grantRequiredConsents,
} from '@/test/fixtures';
import { isCodedError } from '@/lib/errors';
import {
  listReferralCandidates,
  proposeReferral,
  respondReferral,
  reviewReferral,
  proposeReferralAcceptance,
  respondReferralAcceptance,
  cancelReferral,
  listMyReferrals,
} from './referrals';
import { awardReferralInTx, finalizeDuePoints, runPointBackfill } from './points';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const DAY = 86400000;
const T0 = new Date('2102-01-05T12:00:00Z');
async function fixture() {
  const inst = await createInstitution(db);
  const alumni = await createUser(db);
  const student = await createUser(db);
  const admin = await createUser(db);
  for (const [userId, role] of [
    [alumni, 'ALUMNI'],
    [student, 'STUDENT'],
    [admin, 'ACADEMIC'],
  ] as const) {
    await addMembership(db, {
      userId,
      role,
      departmentId: inst.deptA1,
      status: 'VERIFIED',
      graduationYear: role === 'ALUMNI' ? 2020 : null,
      entryYear: role === 'STUDENT' ? 2024 : null,
    });
    await grantRequiredConsents(db, userId);
  }
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  for (const [action, points] of [
    ['REFERRAL_GIVEN', 20],
    ['REFERRAL_ACCEPTED', 30],
  ] as const)
    await db.pointRule.upsert({
      where: { action },
      create: { action, points, delayDays: 14 },
      update: { points, delayDays: 14, isActive: true },
    });
  await db.contactRequest.create({
    data: {
      requesterId: alumni,
      targetId: student,
      status: 'APPROVED',
      fields: ['EMAIL'],
      decidedAt: T0,
    },
  });
  return { inst, alumni, student, admin };
}
async function approved(f: Awaited<ReturnType<typeof fixture>>, at = T0) {
  const deps = { db, now: () => at };
  const claim = await proposeReferral(deps, f.alumni, {
    studentId: f.student,
    organizationName: 'Sınama Kurumu',
  });
  await respondReferral(deps, f.student, { referralId: claim.referralId, decision: 'CONFIRM' });
  await reviewReferral(deps, f.admin, {
    referralId: claim.referralId,
    stage: 'REFERRAL',
    decision: 'APPROVE',
  });
  return claim.referralId;
}
async function accepted(f: Awaited<ReturnType<typeof fixture>>, id: string, at: Date) {
  const deps = { db, now: () => at };
  await proposeReferralAcceptance(deps, f.student, { referralId: id });
  await respondReferralAcceptance(deps, f.alumni, { referralId: id, decision: 'CONFIRM' });
  await reviewReferral(deps, f.admin, { referralId: id, stage: 'ACCEPTANCE', decision: 'APPROVE' });
}
async function code(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    if (!isCodedError(e)) throw e;
    return e.code;
  }
}

it('ilk puan kesinleşse de kabul puanının kendi 14 günlük iptal penceresi açıktır', async () => {
  const f = await fixture();
  const id = await approved(f);
  const acceptanceAt = new Date(+T0 + 21 * DAY);
  await finalizeDuePoints({ db, now: () => acceptanceAt });
  await accepted(f, id, acceptanceAt);
  const before = new Date(+acceptanceAt + 14 * DAY - 1);
  expect(
    await code(cancelReferral({ db, now: () => before }, f.alumni, { referralId: id })),
  ).toBeNull();
  const entries = await db.pointEntry.findMany({
    where: { sourceId: id },
    orderBy: { points: 'asc' },
  });
  expect(entries.map((e) => [e.action, e.status, e.points])).toEqual([
    ['REFERRAL_GIVEN', 'FINAL', 20],
    ['REFERRAL_ACCEPTED', 'REVOKED', 30],
  ]);
  await runPointBackfill({ db, now: () => new Date(+before + 2 * DAY) }, { since: T0 });
  expect(await db.pointEntry.count({ where: { sourceId: id, status: 'REVOKED' } })).toBe(1);
});

it('her aşamada 14 gün eksi 1 ms bekler; tam sınırda kesinleşir ve iptal kapanır', async () => {
  const f = await fixture();
  const id = await approved(f);
  const at = new Date(+T0 + 21 * DAY);
  const given = await db.pointEntry.findFirstOrThrow({
    where: { sourceId: id, action: 'REFERRAL_GIVEN' },
  });
  expect(given.finalizesAt).toEqual(new Date(+T0 + 14 * DAY));
  await finalizeDuePoints({ db, now: () => new Date(+T0 + 14 * DAY - 1) });
  expect((await db.pointEntry.findUniqueOrThrow({ where: { id: given.id } })).status).toBe(
    'PENDING',
  );
  await finalizeDuePoints({ db, now: () => new Date(+T0 + 14 * DAY) });
  expect((await db.pointEntry.findUniqueOrThrow({ where: { id: given.id } })).status).toBe('FINAL');
  expect(
    await code(
      cancelReferral({ db, now: () => new Date(+T0 + 14 * DAY) }, f.alumni, { referralId: id }),
    ),
  ).toBe('REFERRAL_CANCEL_WINDOW_CLOSED');
  await accepted(f, id, at);
  const entry = await db.pointEntry.findFirstOrThrow({
    where: { sourceId: id, action: 'REFERRAL_ACCEPTED' },
  });
  expect(entry.finalizesAt).toEqual(new Date(+at + 14 * DAY));
  await finalizeDuePoints({ db, now: () => new Date(+at + 14 * DAY - 1) });
  expect((await db.pointEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe(
    'PENDING',
  );
  await finalizeDuePoints({ db, now: () => new Date(+at + 14 * DAY) });
  expect((await db.pointEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('FINAL');
  expect(
    await code(
      cancelReferral({ db, now: () => new Date(+at + 14 * DAY) }, f.alumni, { referralId: id }),
    ),
  ).toBe('REFERRAL_CANCEL_WINDOW_CLOSED');
});

it('izinli olmayan var/yok/başka üniversite öğrenci seçimi aynı yanıttır; liste kimlik ve sayım sızdırmaz', async () => {
  const f = await fixture();
  const unrelated = await createUser(db);
  const outside = await createUser(db);
  const inst = await createInstitution(db);
  for (const [userId, departmentId] of [
    [unrelated, f.inst.deptA1],
    [outside, inst.deptA1],
  ] as const)
    await addMembership(db, { userId, departmentId, role: 'STUDENT', entryYear: 2024 });
  await db.contactRequest.create({
    data: {
      requesterId: outside,
      targetId: f.alumni,
      status: 'APPROVED',
      fields: ['EMAIL'],
      decidedAt: T0,
    },
  });
  const deps = { db, now: () => T0 };
  const list = await listReferralCandidates(deps, f.alumni, {});
  expect(Object.keys(list)).toEqual(['students']);
  expect(list.students).toHaveLength(1);
  expect(list.students[0]?.id).toBe(f.student);
  expect(Object.keys(list.students[0]!).sort()).toEqual(['departmentName', 'id', 'name']);
  for (const studentId of [unrelated, outside, 'missing-review-student'])
    expect(
      await code(proposeReferral(deps, f.alumni, { studentId, organizationName: 'Kurum' })),
    ).toBe('REFERRAL_NOT_ELIGIBLE');
  expect(await code(listReferralCandidates(deps, f.student, {}))).toBe('AUTH_FORBIDDEN');
});

it('üçlü akış iletişim taleplerine dokunmaz; katılımcı dışı kimlikle okuma ve karar reddedilir', async () => {
  const f = await fixture();
  const other = await createUser(db);
  await addMembership(db, {
    userId: other,
    departmentId: f.inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, other);
  const before = await db.contactRequest.findMany({
    where: { OR: [{ requesterId: f.alumni }, { targetId: f.alumni }] },
    orderBy: { id: 'asc' },
  });
  const id = await approved(f);
  const deps = { db, now: () => T0 };
  expect((await listMyReferrals(deps, other, {})).items).toEqual([]);
  expect(await code(respondReferral(deps, other, { referralId: id, decision: 'REJECT' }))).toBe(
    'RESOURCE_NOT_FOUND',
  );
  expect(await code(proposeReferralAcceptance(deps, other, { referralId: id }))).toBe(
    'RESOURCE_NOT_FOUND',
  );
  await accepted(f, id, T0);
  await cancelReferral(deps, f.alumni, { referralId: id });
  expect(
    await db.contactRequest.findMany({
      where: { OR: [{ requesterId: f.alumni }, { targetId: f.alumni }] },
      orderBy: { id: 'asc' },
    }),
  ).toEqual(before);
});

it('aynı ikilinin eşzamanlı iki onayında tek puanlı kayıt; sonraki aylarda 50 ve 25 çarpanı', async () => {
  const f = await fixture();
  const ids = [];
  for (let i = 0; i < 2; i++)
    ids.push(
      (
        await db.referralClaim.create({
          data: {
            alumnusId: f.alumni,
            studentId: f.student,
            departmentIdAtWrite: f.inst.deptA1,
            organizationName: 'Kurum',
            status: 'APPROVED',
            studentConfirmedAt: T0,
            approvedAt: T0,
          },
        })
      ).id,
    );
  await Promise.all(
    ids.map((id) => db.$transaction((tx) => awardReferralInTx(tx, id, 'REFERRAL', T0))),
  );
  expect(
    (
      await db.pointEntry.findMany({
        where: { sourceId: { in: ids } },
        orderBy: { points: 'desc' },
      })
    ).map((e) => e.points),
  ).toEqual([20, 0]);
  for (const [at, multiplier] of [
    [new Date('2102-02-05T12:00:00Z'), 50],
    [new Date('2102-03-05T12:00:00Z'), 25],
  ] as const) {
    const id = await approved(f, at);
    expect(await db.pointEntry.findFirst({ where: { sourceId: id } })).toMatchObject({
      multiplierPercent: multiplier,
    });
  }
});

it('kesinleştirme görevi gecikse de eski onayın dolmuş süresi iptalle geri alınmaz', async () => {
  const f = await fixture();
  const id = await approved(f);
  const at = new Date(+T0 + 21 * DAY);
  await accepted(f, id, at);
  // İlk puan hâlâ PENDING: cron çalışmamış. Hak ediş tarihi yine ilk onay + 14 gündür.
  await cancelReferral({ db, now: () => new Date(+at + DAY) }, f.alumni, { referralId: id });
  await finalizeDuePoints({ db, now: () => new Date(+at + DAY) });
  expect(
    await db.pointEntry.findFirst({ where: { sourceId: id, action: 'REFERRAL_GIVEN' } }),
  ).toMatchObject({ status: 'FINAL', points: 20 });
  expect(
    await db.pointEntry.findFirst({ where: { sourceId: id, action: 'REFERRAL_ACCEPTED' } }),
  ).toMatchObject({ status: 'REVOKED', points: 30 });
});

it('tamamlanmış görüşme aday yapar; bekleyen ve iptal görüşme yapmaz, çoklu iletişim bağlamı tek seçenek olur', async () => {
  const f = await fixture();
  const completed = await createUser(db);
  const pending = await createUser(db);
  const cancelled = await createUser(db);
  for (const [i, userId] of [completed, pending, cancelled].entries()) {
    await addMembership(db, {
      userId,
      departmentId: f.inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await db.appointment.create({
      data: {
        mentorId: f.alumni,
        menteeId: userId,
        mode: 'ONLINE',
        startsAt: new Date(+T0 + i * DAY),
        endsAt: new Date(+T0 + i * DAY + 1800000),
        expiresAt: new Date(+T0 + i * DAY - 3600000),
        status: i === 0 ? 'COMPLETED' : i === 1 ? 'REQUESTED' : 'CANCELLED',
        decidedAt: i === 0 ? T0 : null,
        ...(i === 2 ? { cancelledById: f.alumni, cancelReason: 'Plan değişti' } : {}),
      },
    });
  }
  await db.contactRequest.create({
    data: {
      requesterId: f.alumni,
      targetId: f.student,
      source: 'SEEKER_PROFILE',
      sourceTitle: 'Aday',
      sourceOrganization: 'Bölüm',
      status: 'APPROVED',
      fields: ['EMAIL'],
      decidedAt: T0,
    },
  });
  const deps = { db, now: () => T0 };
  expect(
    (await listReferralCandidates(deps, f.alumni, {})).students.map((s) => s.id).sort(),
  ).toEqual([f.student, completed].sort());
  expect(
    (await proposeReferral(deps, f.alumni, { studentId: completed, organizationName: 'Kurum' }))
      .status,
  ).toBe('PROPOSED');
});
