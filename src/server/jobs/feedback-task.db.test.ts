import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';
const send = vi.hoisted(() =>
  vi.fn(async (item: { idempotencyKey: string; recipientUserId?: string }) => {
    void item;
    return { emailLogId: 'queued' };
  }),
);
vi.mock('./email', () => ({ enqueueEmail: send }));
import { scheduleFeedbackPrompts } from './feedback-task';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
describe('form bildirim işi', () => {
  it('bir saat dolmadan göndermez; iki taraf için anahtar sabittir ve kapalı tercihi atlar', async () => {
    const inst = await createInstitution(db);
    const mentor = await createUser(db);
    const student = await createUser(db);
    await addMembership(db, { userId: mentor, role: 'ACADEMIC', departmentId: inst.deptA1 });
    await addMembership(db, {
      userId: student,
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2024,
    });
    const now = new Date('2030-07-20T12:00:00Z');
    const row = await db.appointment.create({
      data: {
        mentorId: mentor,
        menteeId: student,
        startsAt: new Date(now.getTime() - 90 * 60000),
        endsAt: new Date(now.getTime() - 59 * 60000),
        expiresAt: new Date(now.getTime() - 2 * 3600000),
        decidedAt: new Date(now.getTime() - 3 * 3600000),
        mode: 'ONLINE',
        status: 'CONFIRMED',
      },
    });
    await scheduleFeedbackPrompts(db, now);
    expect(send.mock.calls.some(([value]) => value.idempotencyKey.includes(row.id))).toBe(false);
    await scheduleFeedbackPrompts(db, new Date(now.getTime() + 60000));
    await scheduleFeedbackPrompts(db, new Date(now.getTime() + 60000));
    let calls = send.mock.calls
      .map(([value]) => value)
      .filter((value) => value.idempotencyKey.includes(row.id));
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((value) => value.idempotencyKey)).size).toBe(2);
    await db.notificationPreference.create({
      data: { userId: student, type: 'APPOINTMENT', enabled: false },
    });
    send.mockClear();
    await scheduleFeedbackPrompts(db, new Date(now.getTime() + 60000));
    calls = send.mock.calls
      .map(([value]) => value)
      .filter((value) => value.idempotencyKey.includes(row.id));
    expect(calls.map((value) => value.recipientUserId)).toEqual([mentor]);
  });
});
