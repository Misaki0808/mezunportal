import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';
import { createMemoryStorage } from '../external/storage';
import {
  answerRequest,
  createRequest,
  expireRequests,
  getAvailability,
  markHelpful,
  readFile,
} from './cv-review-request';
import { removeUploadFiles } from './cv-shared';
import { buildDataExport } from './dataExport';
import { settleEvents } from './event';
import { deleteAccount } from './accountDeletion';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
let institution: Institution;
beforeAll(async () => {
  institution = await createInstitution(db);
});
const now = new Date('2030-06-15T10:00:00Z');
async function setup(limit = 3) {
  const student = await createUser(db),
    mentor = await createUser(db);
  await addMembership(db, {
    userId: student,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await addMembership(db, {
    userId: mentor,
    departmentId: institution.deptA1,
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
  const storage = createMemoryStorage(),
    key = `cv/${student}/test.pdf`;
  await storage.put(key, new TextEncoder().encode('%PDF-test'), { contentType: 'application/pdf' });
  const cv = await db.cvUpload.create({
    data: {
      userId: student,
      storageKey: key,
      byteSize: 9,
      pageCount: 1,
      status: 'APPLIED',
      appliedAt: now,
    },
  });
  const notices: string[] = [];
  const deps = {
    db,
    storage,
    now: () => now,
    notify: async (_id: string, event: 'requested' | 'answered') => {
      notices.push(event);
    },
  };
  return { student, mentor, storage, key, cv, deps, notices };
}
describe('CV inceleme', () => {
  it('açıkken dosya korunur; yanıttan sonra 403, eski dosya silinir ve faydalı tek kez işlenir', async () => {
    const h = await setup();
    const request = await createRequest(h.deps, h.student, {
      mentorId: h.mentor,
      note: 'Öneri lütfen',
    });
    await settleEvents();
    const events = await db.event.findMany({
      where: { userId: h.student, type: 'CV_REVIEW_REQUESTED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.props).toEqual({});
    expect(await readFile(h.deps, h.mentor, request.id)).toBeTruthy();
    await expect(readFile(h.deps, h.student, request.id)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
    const nextKey = `cv/${h.student}/next.pdf`;
    await h.storage.put(nextKey, new Uint8Array([1]), { contentType: 'application/pdf' });
    await db.cvUpload.create({
      data: {
        userId: h.student,
        storageKey: nextKey,
        byteSize: 1,
        pageCount: 1,
        status: 'APPLIED',
        appliedAt: new Date(now.getTime() + 1000),
      },
    });
    await db.$transaction((tx) =>
      removeUploadFiles(tx, h.storage, [{ id: h.cv.id, storageKey: h.key }]),
    );
    expect(await h.storage.get(h.key)).toBeTruthy();
    await answerRequest(h.deps, h.mentor, { requestId: request.id, comment: 'Bir örnek ekle.' });
    await expect(readFile(h.deps, h.mentor, request.id)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
    expect(await h.storage.get(h.key)).toBeNull();
    expect((await markHelpful(h.deps, h.student, request.id)).helpfulAt).toEqual(now);
    await expect(markHelpful(h.deps, h.student, request.id)).rejects.toMatchObject({
      code: 'CV_REVIEW_ALREADY_HELPFUL',
    });
    expect(h.notices).toEqual(['requested', 'answered']);
    expect((await buildDataExport(db, h.student)).cvReviewRequests).toMatchObject([
      { id: request.id, note: 'Öneri lütfen', comment: 'Bir örnek ekle.' },
    ]);
    const email = (await db.user.findUniqueOrThrow({ where: { id: h.student } })).email;
    await deleteAccount(
      db,
      h.student,
      { publishedContent: 'DELETE', confirmEmail: email },
      {
        removeStoredFiles: async (keys) => {
          for (const key of keys) await h.storage.delete(key);
        },
      },
    );
    expect(await db.cvReviewRequest.findUnique({ where: { id: request.id } })).toBeNull();
  });
  it('aynı aya eşzamanlı taleplerde aylık sınır aşılmaz ve sebep gösterilir', async () => {
    const h = await setup(1);
    const second = await createUser(db);
    await addMembership(db, {
      userId: second,
      departmentId: institution.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await grantRequiredConsents(db, second);
    const key = `cv/${second}/test.pdf`;
    await h.storage.put(key, new Uint8Array([1]), { contentType: 'application/pdf' });
    await db.cvUpload.create({
      data: {
        userId: second,
        storageKey: key,
        byteSize: 1,
        pageCount: 1,
        status: 'APPLIED',
        appliedAt: now,
      },
    });
    const results = await Promise.allSettled([
      createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Bir' }),
      createRequest(h.deps, second, { mentorId: h.mentor, note: 'İki' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await getAvailability(h.deps, h.student, h.mentor)).reason).toBe('MONTHLY_LIMIT');
  });
  it('son CV dosyası dururken yanıtlanan talep mentor için 403 verir', async () => {
    const h = await setup();
    const request = await createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Merhaba' });
    await answerRequest(h.deps, h.mentor, { requestId: request.id, comment: 'Yorum' });
    expect(await h.storage.get(h.key)).toBeTruthy();
    await expect(readFile(h.deps, h.mentor, request.id)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
  });
  it('mentor hesabı silinince talep kapanır, eski tutulan dosya temizlenir', async () => {
    const h = await setup();
    const request = await createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Merhaba' });
    const nextKey = `cv/${h.student}/new.pdf`;
    await h.storage.put(nextKey, new Uint8Array([1]), { contentType: 'application/pdf' });
    await db.cvUpload.create({
      data: {
        userId: h.student,
        storageKey: nextKey,
        byteSize: 1,
        pageCount: 1,
        status: 'APPLIED',
        appliedAt: new Date(now.getTime() + 1000),
      },
    });
    const email = (await db.user.findUniqueOrThrow({ where: { id: h.mentor } })).email;
    await deleteAccount(
      db,
      h.mentor,
      { publishedContent: 'DELETE', confirmEmail: email },
      {
        removeStoredFiles: async (keys) => {
          for (const key of keys) await h.storage.delete(key);
        },
      },
    );
    expect((await db.cvReviewRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
      'EXPIRED',
    );
    expect(await h.storage.get(h.key)).toBeNull();
    expect(await h.storage.get(nextKey)).toBeTruthy();
  });
  it('14 gün sonra iş tekrarı güvenli, dosya yetkisi kapanır', async () => {
    const h = await setup();
    const req = await createRequest(h.deps, h.student, { mentorId: h.mentor, note: 'Merhaba' });
    const later = { ...h.deps, now: () => new Date(now.getTime() + 14 * 86400000) };
    await expect(readFile(later, h.mentor, req.id)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
    await expireRequests(later);
    await expireRequests(later);
    expect((await db.cvReviewRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
      'EXPIRED',
    );
  });
});
