import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { actionFailure } from '@/lib/action-result';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { reviewCampusEvent, cancelCampusEvent, getCampusEventCode } from './campus-event';
import { reviewJobPosting, resolveJobPostingReport } from './job-posting-moderation';
import { resolveExperienceReport } from './experience';
import { reviewReferral } from './referrals';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('yönetici: yabancı kaynak ve olmayan kaynak aynı yanıt, durum ve bildirim değişmez', async () => {
  const a = await createInstitution(db),
    b = await createInstitution(db);
  const admin = await createUser(db),
    author = await createUser(db),
    student = await createUser(db);
  await addMembership(db, {
    userId: admin,
    departmentId: a.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: a.deptA1 });
  await grantRequiredConsents(db, admin);
  await addMembership(db, {
    userId: author,
    departmentId: b.deptA1,
    role: 'ALUMNI',
    graduationYear: 2021,
  });
  await addMembership(db, {
    userId: student,
    departmentId: b.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  const now = new Date('2030-06-15T12:00:00Z'),
    deps = { db, now: () => now };
  const event = await db.campusEvent.create({
    data: {
      title: 'Sentetik etkinlik',
      description: 'Sentetik açıklama',
      location: 'Kampüs',
      startsAt: now,
      endsAt: new Date(now.getTime() + 3600000),
      capacity: 10,
      departments: { create: { departmentId: b.deptA1 } },
    },
  });
  const posting = await db.jobPosting.create({
    data: {
      authorId: author,
      departmentIdAtWrite: b.deptA1,
      targets: { create: { departmentId: b.deptA1 } },
    },
  });
  const jr = await db.jobPostingReport.create({
    data: { postingId: posting.id, reporterId: student, reason: 'Denetim gerekçesi' },
  });
  const experience = await db.experience.create({
    data: { authorId: author, departmentIdAtWrite: b.deptA1, type: 'INTERNSHIP' },
  });
  const er = await db.report.create({
    data: { targetId: experience.id, reporterId: student, reason: 'Denetim gerekçesi' },
  });
  const referral = await db.referralClaim.create({
    data: { alumnusId: author, studentId: student, departmentIdAtWrite: b.deptA1 },
  });
  const missing = randomUUID();
  const checks: Array<[string, string, (id: string) => Promise<unknown>]> = [
    [
      'etkinlik yayın',
      event.id,
      (id) =>
        reviewCampusEvent(deps, admin, {
          eventId: id,
          decision: 'PUBLISH',
          reason: 'Uygun gerekçe',
        }),
    ],
    [
      'etkinlik iptal',
      event.id,
      (id) => cancelCampusEvent(deps, admin, { eventId: id, reason: 'Uygun gerekçe' }),
    ],
    [
      'etkinlik kod',
      event.id,
      (id) => getCampusEventCode(deps, admin, { eventId: id }, 'secret', 'https://portal.example'),
    ],
    [
      'ilan karar',
      posting.id,
      (id) =>
        reviewJobPosting(deps, admin, {
          postingId: id,
          decision: 'REJECT',
          reason: 'Uygun gerekçe',
        }),
    ],
    [
      'ilan şikâyet',
      jr.id,
      (id) =>
        resolveJobPostingReport(deps, admin, {
          reportId: id,
          decision: 'DISMISS',
          reason: 'Uygun gerekçe',
        }),
    ],
    [
      'deneyim şikâyet',
      er.id,
      (id) =>
        resolveExperienceReport(
          db,
          admin,
          { reportId: id, decision: 'DISMISSED', reason: 'Uygun gerekçe' },
          now,
        ),
    ],
    [
      'referans',
      referral.id,
      (id) =>
        reviewReferral(deps, admin, {
          referralId: id,
          stage: 'REFERRAL',
          decision: 'REJECT',
          reason: 'Uygun gerekçe',
        }),
    ],
  ];
  await expect(
    resolveExperienceReport(
      db,
      student,
      { reportId: er.id, decision: 'DISMISSED', reason: 'Uygun gerekçe' },
      now,
    ),
  ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  await expect(
    resolveExperienceReport(
      db,
      student,
      { reportId: missing, decision: 'DISMISSED', reason: 'Uygun gerekçe' },
      now,
    ),
  ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  const before = [
    await db.adminAuditLog.count({ where: { actorId: admin } }),
    await db.notificationIntent.count({ where: { userId: { in: [admin, author, student] } } }),
    await db.inAppNotification.count({ where: { userId: { in: [admin, author, student] } } }),
  ];
  for (const [name, id, call] of checks) {
    const code = async (value: string) =>
      call(value).then(
        () => 'OK',
        (e: { code?: string }) => e.code,
      );
    expect(await code(id), name).toBe('RESOURCE_NOT_FOUND');
    expect(await code(missing), name).toBe('RESOURCE_NOT_FOUND');
  }
  // Gerçek yerel HTTP üzerinden aynı giriş/çıkış sınırı: uygulamanın ActionFailure dönüşümünü kullanır.
  const server = createServer(async (req, res) => {
    const [index, id] = (req.url ?? '').slice(1).split('/');
    const entry = checks[Number(index)];
    if (!entry || !id) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const result = await entry[2](id).then(() => ({ ok: true }), actionFailure);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port alınamadı');
  try {
    for (const [index, [name, id]] of checks.entries()) {
      const actual = await (await fetch(`http://127.0.0.1:${address.port}/${index}/${id}`)).json();
      const absent = await (
        await fetch(`http://127.0.0.1:${address.port}/${index}/${missing}`)
      ).json();
      expect(actual, name).toEqual(absent);
      expect(actual, name).toEqual({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  expect([
    await db.adminAuditLog.count({ where: { actorId: admin } }),
    await db.notificationIntent.count({ where: { userId: { in: [admin, author, student] } } }),
    await db.inAppNotification.count({ where: { userId: { in: [admin, author, student] } } }),
  ]).toEqual(before);
  expect((await db.campusEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
    'PENDING',
  );
  expect((await db.jobPostingReport.findUniqueOrThrow({ where: { id: jr.id } })).status).toBe(
    'OPEN',
  );
  expect((await db.report.findUniqueOrThrow({ where: { id: er.id } })).status).toBe('OPEN');
  expect((await db.jobPosting.findUniqueOrThrow({ where: { id: posting.id } })).status).toBe(
    'DRAFT',
  );
  expect((await db.referralClaim.findUniqueOrThrow({ where: { id: referral.id } })).status).toBe(
    'PROPOSED',
  );
});
