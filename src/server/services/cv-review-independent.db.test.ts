import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  createInstitution,
  createUser,
  addMembership,
  grantRequiredConsents,
} from '@/test/fixtures';
import { createLocalStorage, newCvKey } from '../external/storage';
import { loadActor } from '../permissions/actor';
import {
  createRequest,
  answerRequest,
  readFile,
  expireRequests,
  markHelpful,
  getAvailability,
  listRequests,
} from './cv-review-request';
import { applyCv } from './cv';
import { purgeFiles } from './files-purge';
import { settleEvents } from './event';
import { relayNotificationIntents, stageNotification } from './notification-intent';
import { buildDataExport } from './dataExport';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
const now = new Date('2034-06-15T12:00:00Z');
async function fixture(limit = 100) {
  const inst = await createInstitution(db),
    student = await createUser(db),
    mentor = await createUser(db);
  await addMembership(db, {
    userId: student,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await addMembership(db, {
    userId: mentor,
    departmentId: inst.deptA2,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, student);
  await grantRequiredConsents(db, mentor);
  await db.mentorProfile.create({
    data: {
      userId: mentor,
      isActive: true,
      monthlyCapacity: 3,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      cvReviewEnabled: true,
      cvReviewMonthlyLimit: limit,
    },
  });
  const root = await mkdtemp(path.join(tmpdir(), 'r2-cv-review-'));
  roots.push(root);
  const storage = createLocalStorage(root),
    key = newCvKey(student),
    bytes = new TextEncoder().encode('%PDF-1.4\nSentetik\n%%EOF');
  await storage.put(key, bytes, { contentType: 'application/pdf' });
  const cv = await db.cvUpload.create({
    data: {
      userId: student,
      storageKey: key,
      byteSize: bytes.length,
      pageCount: 1,
      status: 'APPLIED',
      appliedAt: new Date(now.getTime() - 1000),
    },
  });
  const notices: string[] = [];
  const deps = {
    db,
    storage,
    now: () => now,
    notify: async (_user: string, event: string, id: string) => {
      notices.push(`${event}:${id}`);
    },
  };
  return { inst, student, mentor, root, storage, key, cv, bytes, notices, deps };
}
async function anotherStudent(h: Awaited<ReturnType<typeof fixture>>) {
  const student = await createUser(db);
  await addMembership(db, {
    userId: student,
    departmentId: h.inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, student);
  const key = newCvKey(student);
  await h.storage.put(key, h.bytes, { contentType: 'application/pdf' });
  await db.cvUpload.create({
    data: {
      userId: student,
      storageKey: key,
      byteSize: h.bytes.length,
      pageCount: 1,
      status: 'APPLIED',
      appliedAt: now,
    },
  });
  return student;
}
it('inceleyici: gerçek dosya açık talepte yeni CV uygulamasından ve files.purge işinden korunur; kapanınca eski dosya gider', async () => {
  const h = await fixture(),
    req = await createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Sentetik not' });
  const nextKey = newCvKey(h.student);
  await h.storage.put(nextKey, h.bytes, { contentType: 'application/pdf' });
  const next = await db.cvUpload.create({
    data: {
      userId: h.student,
      storageKey: nextKey,
      byteSize: h.bytes.length,
      pageCount: 1,
      status: 'PARSED',
      parsedJson: {
        profile: { headline: null, summary: null, city: null },
        education: [],
        positions: [],
        skills: [],
        languages: [],
        certifications: [],
      },
    },
  });
  const actor = (await loadActor(db, h.student, now))!;
  await applyCv(
    { db, storage: h.storage, llm: null, enqueue: async () => {}, dailyLimit: 10, now: () => now },
    actor,
    { cvUploadId: next.id, decisions: [] },
  );
  await db.cvUpload.update({
    where: { id: h.cv.id },
    data: { updatedAt: new Date(now.getTime() - 7200000) },
  });
  await purgeFiles(db, h.storage, now);
  expect(await h.storage.get(h.key)).toEqual(h.bytes);
  expect(await readFile(h.deps, h.mentor, req.id)).toEqual(h.bytes);
  await answerRequest(h.deps, h.mentor, { requestId: req.id, comment: 'Sentetik yanıt' });
  expect(await h.storage.get(h.key)).toBeNull();
  expect(await h.storage.get(nextKey)).toEqual(h.bytes);
  await purgeFiles(db, h.storage, now);
  expect(await h.storage.get(nextKey)).toEqual(h.bytes);
});
it('inceleyici: dosya depodayken yanıt ve süre dolumu erişimi keser; yabancı mentor/öğrenci okuyamaz', async () => {
  const h = await fixture(),
    req = await createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Sentetik not' }),
    other = await anotherStudent(h);
  for (const id of [h.student, other])
    await expect(readFile(h.deps, id, req.id)).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  const outsider = await createUser(db);
  await addMembership(db, {
    userId: outsider,
    departmentId: h.inst.deptA1,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, outsider);
  await db.mentorProfile.create({
    data: {
      userId: outsider,
      isActive: true,
      monthlyCapacity: 3,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
    },
  });
  await expect(readFile(h.deps, outsider, req.id)).rejects.toMatchObject({
    code: 'AUTH_FORBIDDEN',
  });
  await expect(markHelpful(h.deps, h.student, req.id)).rejects.toMatchObject({
    code: 'CV_REVIEW_CLOSED',
  });
  await answerRequest(h.deps, h.mentor, { requestId: req.id, comment: 'Yanıt' });
  expect(await h.storage.get(h.key)).toEqual(h.bytes);
  await expect(readFile(h.deps, h.mentor, req.id)).rejects.toMatchObject({
    code: 'AUTH_FORBIDDEN',
  });
  const expired = await createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Yeni not' }),
    edge = new Date(now.getTime() + 14 * 86400000);
  expect(
    await readFile({ ...h.deps, now: () => new Date(edge.getTime() - 1) }, h.mentor, expired.id),
  ).toEqual(h.bytes);
  const later = { ...h.deps, now: () => edge };
  await expect(readFile(later, h.mentor, expired.id)).rejects.toMatchObject({
    code: 'AUTH_FORBIDDEN',
  });
  await expireRequests(later);
  await expireRequests(later);
  expect(h.notices.filter((n) => n === `expired:${expired.id}`)).toHaveLength(1);
  expect(await h.storage.get(h.key)).toEqual(h.bytes);
  await expect(readFile(later, h.mentor, expired.id)).rejects.toMatchObject({
    code: 'AUTH_FORBIDDEN',
  });
});
it('inceleyici: İstanbul ay sınırı son milisaniyede eski aya, tam gece yeni aya sayılır', async () => {
  const h = await fixture(1),
    edge = new Date('2034-06-30T21:00:00.000Z'),
    before = { ...h.deps, now: () => new Date(edge.getTime() - 1) };
  const first = await createRequest(before, h.student, { mentorId: h.mentor, note: 'Önce' });
  await answerRequest(before, h.mentor, { requestId: first.id, comment: 'Yanıt' });
  expect((await getAvailability(before, h.student, h.mentor)).reason).toBe('MONTHLY_LIMIT');
  const after = { ...h.deps, now: () => edge };
  expect((await getAvailability(after, h.student, h.mentor)).available).toBe(true);
  await createRequest(after, h.student, { mentorId: h.mentor, note: 'Sonra' });
  expect((await getAvailability(after, h.student, h.mentor)).reason).toBe('MONTHLY_LIMIT');
});
it('inceleyici: on yarış turunda aylık son hak yalnız bir öğrenciye gider; aynı ikilide benzersizlik veritabanındadır', async () => {
  for (let round = 0; round < 10; round++) {
    const h = await fixture(1),
      second = await anotherStudent(h);
    const results = await Promise.allSettled(
      [h.student, second].map((id) =>
        createRequest(h.deps, id, { mentorId: h.mentor, note: 'Yarış' }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === 'rejected')
        .map((r) => r.status === 'rejected' && r.reason.code),
    ).toEqual(['CV_REVIEW_MONTHLY_LIMIT']);
    const row = await db.cvReviewRequest.findFirstOrThrow({ where: { mentorId: h.mentor } });
    await expect(
      db.cvReviewRequest.create({
        data: {
          id: randomUUID(),
          studentId: row.studentId,
          mentorId: row.mentorId,
          cvUploadId: row.cvUploadId,
          note: 'İkinci',
          expiresAt: row.expiresAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  }
}, 30000);
it('inceleyici: faydalı yalnız talebin öğrencisinden ve yarışta bir kez; döküm ve olay kişisel dosya verisi taşımaz', async () => {
  const h = await fixture(),
    other = await anotherStudent(h),
    req = await createRequest(h.deps, h.student, {
      mentorId: h.mentor,
      note: 'Yalnız taraflara not',
    });
  await answerRequest(h.deps, h.mentor, { requestId: req.id, comment: 'Yalnız taraflara yanıt' });
  for (const id of [other, h.mentor])
    await expect(markHelpful(h.deps, id, req.id)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => markHelpful(h.deps, h.student, req.id)),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    results
      .filter((r) => r.status === 'rejected')
      .every((r) => r.status === 'rejected' && r.reason.code === 'CV_REVIEW_ALREADY_HELPFUL'),
  ).toBe(true);
  expect((await listRequests(h.deps, other, { role: 'STUDENT', limit: 50 })).items).toEqual([]);
  await settleEvents();
  expect(
    (await db.event.findMany({ where: { userId: h.student, type: 'CV_REVIEW_REQUESTED' } })).map(
      (e) => e.props,
    ),
  ).toEqual([{}]);
  for (const id of [h.student, h.mentor]) {
    const rows = (await buildDataExport(db, id)).cvReviewRequests;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/storageKey|cvUploadId|email|phone/);
  }
});
it('inceleyici: başka üniversite ve askıdaki/silinmiş mentor talep alamaz; güncel öğrenci yetkisi yeniden okunur', async () => {
  const h = await fixture(),
    foreign = await createInstitution(db);
  await db.membership.updateMany({
    where: { userId: h.mentor },
    data: { departmentId: foreign.deptA1 },
  });
  expect((await getAvailability(h.deps, h.student, h.mentor)).reason).toBe('NOT_MENTOR');
  await db.membership.updateMany({
    where: { userId: h.mentor },
    data: { departmentId: h.inst.deptA1 },
  });
  for (const patch of [{ banned: true }, { banned: false, deletedAt: now }]) {
    await db.user.update({ where: { id: h.mentor }, data: patch });
    expect((await getAvailability(h.deps, h.student, h.mentor)).reason).toBe('NOT_MENTOR');
  }
  await db.user.update({ where: { id: h.mentor }, data: { banned: false, deletedAt: null } });
  await db.user.update({ where: { id: h.student }, data: { banned: true } });
  await expect(
    createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Yasak' }),
  ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_SUSPENDED' });
  expect(await db.cvReviewRequest.count({ where: { mentorId: h.mentor } })).toBe(0);
});

it('inceleyici: kuyruk kesilince CV talebi ve kişisel verisiz niyet kalır; telafi aynı iş anahtarıyla tekilleşir', async () => {
  const h = await fixture(),
    deps = {
      ...h.deps,
      notify: async () => {
        throw new Error('Sahte kuyruk kesintisi');
      },
    };
  const request = await createRequest(deps, h.student, {
    mentorId: h.mentor,
    note: 'Niyete yazılmayan kişisel not',
  });
  const payload = { type: 'cvReview' as const, event: 'requested' as const, requestId: request.id };
  expect(await db.notificationIntent.count({ where: { userId: h.mentor } })).toBe(1);
  const intent = await db.notificationIntent.findFirstOrThrow({ where: { userId: h.mentor } });
  expect(intent.payload).toEqual(payload);
  expect((await db.cvReviewRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
    'OPEN',
  );
  await db.$transaction((tx) => stageNotification(tx, h.mentor, payload));
  expect(await db.notificationIntent.count({ where: { userId: h.mentor } })).toBe(1);
  await relayNotificationIntents(db, async () => {
    throw new Error('Sahte kuyruk kesintisi');
  });
  expect(await db.notificationIntent.count({ where: { userId: h.mentor } })).toBe(1);
  let delivered = 0;
  const send = async (row: { userId: string }) => {
    if (row.userId !== h.mentor) throw new Error('Başka örnek veri');
    delivered++;
  };
  await relayNotificationIntents(db, send);
  await relayNotificationIntents(db, send);
  expect(delivered).toBe(1);
  expect(await db.notificationIntent.count({ where: { userId: h.mentor } })).toBe(0);
  await answerRequest(deps, h.mentor, {
    requestId: request.id,
    comment: 'Niyete yazılmayan yanıt',
  });
  expect(
    (await db.notificationIntent.findMany({ where: { userId: h.student } })).map(
      (row) => row.payload,
    ),
  ).toEqual([{ type: 'cvReview', event: 'answered', requestId: request.id }]);
  const second = await createRequest(deps, h.student, { mentorId: h.mentor, note: 'İkinci not' });
  await expireRequests({ ...deps, now: () => new Date(now.getTime() + 14 * 86400000) });
  expect(
    await db.notificationIntent.count({
      where: { userId: h.student, payload: { path: ['requestId'], equals: second.id } },
    }),
  ).toBe(1);
});
it('inceleyici: niyet yazımı geri alınırsa talep de kısmi oluşmaz', async () => {
  const h = await fixture();
  const broken = db.$extends({
    query: {
      notificationIntent: {
        upsert: async () => {
          throw new Error('Sahte niyet yazım hatası');
        },
      },
    },
  });
  await expect(
    createRequest({ ...h.deps, db: broken as unknown as typeof db }, h.student, {
      mentorId: h.mentor,
      note: 'Geri alınan not',
    }),
  ).rejects.toThrow('Sahte niyet yazım hatası');
  expect(await db.cvReviewRequest.count({ where: { studentId: h.student } })).toBe(0);
  expect(await db.notificationIntent.count({ where: { userId: h.mentor } })).toBe(0);
});
