import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { isCodedError } from '@/lib/errors';
import { mentorRatings, requestedStudentSummary } from './feedback-summary';
import { listAdminFeedback } from './admin-feedback';
import { getAppointment } from './appointment';
import { createRecordingNotifier } from './appointment-notifier';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('özetler eşikleri, yazarı ve yalnız yetkili mentor talebini uygular; yönetici bölüm dışını göremez', async () => {
  const inst = await createInstitution(db);
  const member = async (role: 'STUDENT' | 'ACADEMIC', dept = inst.deptA1) => {
    const id = await createUser(db);
    await addMembership(db, {
      userId: id,
      role,
      departmentId: dept,
      ...(role === 'STUDENT' ? { entryYear: 2024 } : {}),
    });
    await grantRequiredConsents(db, id);
    return id;
  };
  const mentor = await member('ACADEMIC'),
    mentor2 = await member('ACADEMIC'),
    viewer = await member('ACADEMIC');
  const student = await member('STUDENT'),
    student2 = await member('STUDENT'),
    student3 = await member('STUDENT');
  const outsider = await member('STUDENT', inst.deptA2);
  let serial = 0;
  const appointment = async (
    mentorId: string,
    menteeId: string,
    status: 'COMPLETED' | 'REQUESTED' = 'COMPLETED',
  ) => {
    const start = new Date(Date.UTC(2030, 5, 10, 10) + serial++ * 86400000);
    return db.appointment.create({
      data: {
        mentorId,
        menteeId,
        status,
        ...(status === 'COMPLETED' ? { decidedAt: new Date(start.getTime() - 25 * 3600000) } : {}),
        startsAt: start,
        endsAt: new Date(start.getTime() + 3600000),
        expiresAt: new Date(start.getTime() - 24 * 3600000),
        mode: 'ONLINE',
      },
    });
  };
  const a = await appointment(mentor, student),
    b = await appointment(mentor, student2),
    c = await appointment(mentor, student3);
  const reply = (appointmentId: string, authorId: string, ratingHalf: number) =>
    db.sessionFeedback.create({
      data: {
        appointmentId,
        authorId,
        happened: true,
        answerOne: 'POSITIVE',
        answerTwo: 'PARTIAL',
        answerThree: 'POSITIVE',
        ratingHalf,
      },
    });
  await reply(a.id, student, 10);
  await reply(b.id, student2, 8);
  expect((await mentorRatings(db, [mentor])).get(mentor)).toBeUndefined();
  await reply(c.id, student3, 9);
  expect((await mentorRatings(db, [mentor])).get(mentor)).toEqual({ average: 4.5, count: 3 });
  await reply(a.id, mentor, 2); // Mentorun kendi puanı kendi ortalamasına girmez.
  expect((await mentorRatings(db, [mentor])).get(mentor)).toEqual({ average: 4.5, count: 3 });
  const request = await appointment(viewer, student, 'REQUESTED');
  expect(await requestedStudentSummary(db, viewer, student)).toBeNull();
  const d = await appointment(mentor2, student);
  await reply(d.id, mentor2, 8);
  expect(await requestedStudentSummary(db, viewer, student)).toMatchObject({
    total: 2,
    interested: 2,
  });
  const deps = { db, calendar: null, notifier: createRecordingNotifier() };
  const mentorView = await getAppointment(deps, viewer, { appointmentId: request.id });
  expect(mentorView.studentSummary).toMatchObject({ total: 2, interested: 2 });
  const studentView = await getAppointment(deps, student, { appointmentId: request.id });
  expect(studentView.studentSummary).toBeUndefined();
  expect(JSON.stringify(studentView)).not.toContain('answerOne');
  expect(JSON.stringify(mentorView)).not.toContain('answerOne');
  // Yetki ilk okumadan sonra kalkarsa ikinci sorgu eski kararla özet döndürmez.
  const stale = {
    appointment: {
      ...db.appointment,
      findFirst: async (...args: Parameters<typeof db.appointment.findFirst>) => {
        const row = await db.appointment.findFirst(...args);
        await db.appointment.delete({ where: { id: request.id } });
        return row;
      },
    },
    sessionFeedback: db.sessionFeedback,
  } as typeof db;
  expect(await requestedStudentSummary(stale, viewer, student)).toBeNull();
  const denied = await requestedStudentSummary(db, mentor2, student).catch(
    (error: unknown) => error,
  );
  expect(isCodedError(denied) && denied.code).toBe('RESOURCE_NOT_FOUND');
  await appointment(mentor, student, 'REQUESTED');
  expect(await requestedStudentSummary(db, mentor, student)).toBeNull(); // kendi yanıtı çıkarılınca yalnız bir mentor
  const other = await appointment(mentor2, outsider);
  const hidden = await reply(other.id, mentor2, 8);
  const admin = await member('ACADEMIC');
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  const list = await listAdminFeedback({ db }, admin);
  expect(list.items.some((item) => item.id === hidden.id)).toBe(false);
  expect(list.items.some((item) => item.id !== hidden.id && item.mentorName)).toBe(true);
  const forbidden = await listAdminFeedback({ db }, viewer).catch((error: unknown) => error);
  expect(isCodedError(forbidden) && forbidden.code).toBe('AUTH_FORBIDDEN');
  await expect(
    db.sessionFeedback.create({
      data: { appointmentId: d.id, authorId: student, happened: true, ratingHalf: 11 },
    }),
  ).rejects.toThrow();
});
