import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';

import { getHomeSummary } from './home';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const HOUR = 3_600_000;
const now = new Date('2031-05-10T12:00:00Z');
const deps = { db, now: () => now };

async function world() {
  const inst = await createInstitution(db);
  const make = async (role: 'STUDENT' | 'ALUMNI', name: string) => {
    const userId = await createUser(db, { name });
    await addMembership(
      db,
      role === 'STUDENT'
        ? { userId, departmentId: inst.deptA1, role, entryYear: 2024 }
        : { userId, departmentId: inst.deptA1, role, graduationYear: 2020 },
    );
    await grantRequiredConsents(db, userId);
    return userId;
  };
  return {
    inst,
    student: await make('STUDENT', 'Deniz Ada Aksoy'),
    mentor: await make('ALUMNI', 'Mert Yıldız'),
  };
}
async function cvRequest(studentId: string, mentorId: string, patch: object = {}) {
  const cv = await db.cvUpload.create({
    data: {
      userId: studentId,
      storageKey: `cv/${studentId}/${Math.random().toString(36).slice(2)}.pdf`,
      byteSize: 9,
      pageCount: 1,
      status: 'APPLIED',
      appliedAt: now,
    },
  });
  return db.cvReviewRequest.create({
    data: {
      studentId,
      mentorId,
      cvUploadId: cv.id,
      note: 'Bakar mısın',
      expiresAt: new Date(now.getTime() + 24 * HOUR),
      ...patch,
    },
  });
}

describe('ana sayfa panosu sayıları', () => {
  it('yeni kullanıcı: sıfır sayılar, ilk ad, rol; yönetici değil', async () => {
    const w = await world();
    expect(await getHomeSummary(deps, w.student)).toEqual({
      firstName: 'Deniz',
      role: 'STUDENT',
      pending: { contactRequests: 0, cvReviewsToAnswer: 0, cvReviewsToRate: 0, feedbackForms: 0 },
      adminPending: null,
    });
    expect((await getHomeSummary(deps, w.mentor)).role).toBe('MENTOR');
  });

  it('yalnız KENDİ bekleyen işleri sayılır: bana gelen talep/inceleme, kendi formum, kendi değerlendirmem', async () => {
    const w = await world();
    const other = await world();
    await db.contactRequest.create({
      data: { requesterId: w.student, targetId: w.mentor, fields: ['EMAIL'], status: 'PENDING' },
    });
    await db.contactRequest.create({
      data: {
        requesterId: other.student,
        targetId: other.mentor,
        fields: ['EMAIL'],
        status: 'APPROVED',
        decidedAt: now,
      },
    });
    await cvRequest(w.student, w.mentor);
    await cvRequest(w.student, w.mentor, { status: 'EXPIRED' });
    // süresi dolmuş ama henüz EXPIRED'a çekilmemiş açık talep (başka öğrenciden) sayılmaz
    await cvRequest(other.student, w.mentor, { expiresAt: new Date(now.getTime() - HOUR) });
    await cvRequest(w.student, w.mentor, {
      status: 'COMPLETED',
      comment: 'Şunu ekle',
      answeredAt: now,
    });
    await cvRequest(w.student, w.mentor, {
      status: 'COMPLETED',
      comment: 'Güzel',
      answeredAt: now,
      helpfulAt: now,
    });
    await db.appointment.create({
      data: {
        mentorId: w.mentor,
        menteeId: w.student,
        startsAt: new Date(now.getTime() - 5 * HOUR),
        endsAt: new Date(now.getTime() - 4 * HOUR),
        expiresAt: new Date(now.getTime() - 24 * HOUR),
        decidedAt: new Date(now.getTime() - 20 * HOUR),
        mode: 'ONLINE',
        status: 'CONFIRMED',
      },
    });
    const mentorView = await getHomeSummary(deps, w.mentor);
    expect(mentorView.pending).toEqual({
      contactRequests: 1,
      cvReviewsToAnswer: 1,
      cvReviewsToRate: 0,
      feedbackForms: 1,
    });
    const studentView = await getHomeSummary(deps, w.student);
    expect(studentView.pending).toEqual({
      contactRequests: 0,
      cvReviewsToAnswer: 0,
      cvReviewsToRate: 1,
      feedbackForms: 1,
    });
    // başka çiftin verisi karışmaz
    expect((await getHomeSummary(deps, other.mentor)).pending.contactRequests).toBe(0);
  });

  it('yönetici: kapsamındaki bekleyen deneyim, şikâyet ve belge sayısı; kapsam dışı sayılmaz', async () => {
    const w = await world();
    const admin = await createUser(db, { name: 'Yönetici Hoca' });
    await addMembership(db, { userId: admin, departmentId: w.inst.deptA1, role: 'ACADEMIC' });
    await grantRequiredConsents(db, admin);
    await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: w.inst.deptA1 });
    const exp = (departmentIdAtWrite: string) =>
      db.experience.create({
        data: {
          authorId: w.student,
          departmentIdAtWrite,
          type: 'INTERNSHIP',
          status: 'PENDING',
          isAnonymous: false,
          organizationName: 'Kurum',
          termYear: 2026,
          termSeason: 'SUMMER',
          durationWeeks: 8,
          pay: 'PAID',
          applicationChannel: 'COMPANY_SITE',
          whatLearned: 'x',
          advice: 'y',
        },
      });
    await exp(w.inst.deptA1);
    await exp(w.inst.deptA1);
    await exp(w.inst.deptA2); // kapsam dışı bölüm
    expect((await getHomeSummary(deps, admin)).adminPending).toBe(2);
    expect((await getHomeSummary(deps, w.student)).adminPending).toBeNull();
  });

  it('silinmiş ya da bilinmeyen kullanıcı için RESOURCE_NOT_FOUND', async () => {
    const w = await world();
    await db.user.update({ where: { id: w.student }, data: { deletedAt: now } });
    await expect(getHomeSummary(deps, w.student)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    await expect(getHomeSummary(deps, 'yok')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});
