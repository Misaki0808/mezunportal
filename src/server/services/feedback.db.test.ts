import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { isCodedError } from '@/lib/errors';
import { feedbackView, studentReliability, submitFeedback } from './feedback';
import { buildDataExport } from './dataExport';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const now = new Date('2030-06-20T12:00:00Z');
async function setup() {
  const institution = await createInstitution(db);
  const mentor = await createUser(db);
  const student = await createUser(db);
  const stranger = await createUser(db);
  for (const [userId, role] of [
    [mentor, 'ACADEMIC'],
    [student, 'STUDENT'],
    [stranger, 'STUDENT'],
  ] as const) {
    await addMembership(db, {
      userId,
      role,
      departmentId: institution.deptA1,
      ...(role === 'STUDENT' ? { entryYear: 2024 } : {}),
    });
    await grantRequiredConsents(db, userId);
  }
  const appointment = await db.appointment.create({
    data: {
      mentorId: mentor,
      menteeId: student,
      startsAt: new Date(now.getTime() - 3 * 3600000),
      endsAt: new Date(now.getTime() - 2 * 3600000),
      expiresAt: new Date(now.getTime() - 4 * 3600000),
      decidedAt: new Date(now.getTime() - 5 * 3600000),
      mode: 'ONLINE',
      status: 'CONFIRMED',
    },
  });
  return { mentor, student, stranger, appointment };
}
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (e) {
    return isCodedError(e) ? e.code : 'unexpected';
  }
};
describe('görüşme sonrası form', () => {
  it('süre ve sahiplik korunur; eşzamanlı tekrar yalnız bir kayıt, iki olumlu yanıtla tamamlanır', async () => {
    const { mentor, student, stranger, appointment } = await setup();
    const input = {
      appointmentId: appointment.id,
      happened: true,
      helpful: true,
      note: 'Özel not',
    };
    expect(await code(submitFeedback(db, stranger, input, now))).toBe('RESOURCE_NOT_FOUND');
    expect(
      await code(
        submitFeedback(db, student, input, new Date(appointment.endsAt.getTime() + 3599999)),
      ),
    ).toBe('FEEDBACK_NOT_READY');
    const results = await Promise.allSettled([
      submitFeedback(db, student, input, now),
      submitFeedback(db, student, input, now),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(
      (await buildDataExport(db, student)).appointments.find((row) => row.id === appointment.id)
        ?.feedback?.note,
    ).toBe('Özel not');
    expect(
      (await buildDataExport(db, mentor)).appointments.find((row) => row.id === appointment.id)
        ?.feedback,
    ).toBeNull();
    await submitFeedback(db, mentor, { ...input, note: null }, now);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(
      'COMPLETED',
    );
    expect(await code(submitFeedback(db, student, input, now))).toBe('FEEDBACK_ALREADY_SUBMITTED');
    expect(await code(feedbackView(db, stranger, appointment.id, now))).toBe('RESOURCE_NOT_FOUND');
  });
  it('mentor katılım olmadı dediğinde NO_SHOW olur ve karşıt yanıt görüşmeyi tamamlamaz', async () => {
    const { mentor, student, appointment } = await setup();
    await submitFeedback(
      db,
      mentor,
      { appointmentId: appointment.id, happened: false, helpful: null, note: null },
      now,
    );
    await submitFeedback(
      db,
      student,
      { appointmentId: appointment.id, happened: true, helpful: null, note: null },
      now,
    );
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(
      'NO_SHOW',
    );
    expect(await studentReliability(db, student, student, now)).toMatchObject({
      label: 'NEW',
      total: 1,
      noShow: 1,
    });
    expect(await code(studentReliability(db, mentor, student, now))).toBe('RESOURCE_NOT_FOUND');
  });
});
