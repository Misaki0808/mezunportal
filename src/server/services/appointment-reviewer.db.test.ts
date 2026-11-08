import { afterAll, expect, it } from 'vitest';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { CalendarError } from '../external/calendar/types';
import { syncCalendarEvents } from './appointment-jobs';
import { createTestPrisma } from '@/test/db';
import { createUser, createInstitution, addMembership } from '@/test/fixtures';
import { createRecordingNotifier } from './appointment-notifier';
import { deleteAccount } from './accountDeletion';
import { getAppointment, respondAppointment, type AppointmentDeps } from './appointment';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const now = new Date('2030-06-17T06:00:00Z');
const deps: AppointmentDeps = {
  db,
  now: () => now,
  calendar: null,
  notifier: createRecordingNotifier(),
};
async function scene() {
  const inst = await createInstitution(db);
  const mentorId = await createUser(db),
    menteeId = await createUser(db);
  for (const [userId, role] of [
    [mentorId, 'ALUMNI'],
    [menteeId, 'STUDENT'],
  ] as const)
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role,
      ...(role === 'ALUMNI' ? { graduationYear: 2021 } : { entryYear: 2024 }),
    });
  await db.mentorProfile.create({
    data: {
      userId: mentorId,
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      isActive: true,
    },
  });
  const row = await db.appointment.create({
    data: {
      mentorId,
      menteeId,
      mode: 'ONLINE',
      startsAt: new Date('2030-06-26T07:00:00Z'),
      endsAt: new Date('2030-06-26T07:30:00Z'),
      expiresAt: new Date('2030-06-20T06:00:00Z'),
    },
  });
  return { mentorId, menteeId, row };
}
it('inceleyici: hesabı silinen iptal edenin gerekçesi karşı tarafın geçmişinde kalmaz', async () => {
  const { mentorId, menteeId, row } = await scene();
  await db.appointment.update({
    where: { id: row.id },
    data: {
      status: 'CANCELLED',
      cancelledById: menteeId,
      cancelReason: 'Silinecek özel iptal açıklaması',
    },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: menteeId } });
  await deleteAccount(
    db,
    menteeId,
    { publishedContent: 'ANONYMIZE', confirmEmail: user.email },
    { removeStoredFiles: null },
    now,
  );
  expect((await getAppointment(deps, mentorId, { appointmentId: row.id })).cancelReason).toBeNull();
});
it('inceleyici: önce başlayan askı yazımından sonra mentor eski yetkiyle onay veremez', async () => {
  const { mentorId, row } = await scene();
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    ready = new Promise<void>((r) => (locked = r));
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${mentorId} FOR UPDATE`;
      await tx.user.update({ where: { id: mentorId }, data: { banned: true } });
      locked();
      await gate;
    },
    { timeout: 10000 },
  );
  await ready;
  let settled = false;
  const response = respondAppointment(deps, mentorId, {
    appointmentId: row.id,
    decision: 'CONFIRM',
  });
  void response.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    const deadline = Date.now() + 5000;
    let waiting = false;
    while (Date.now() < deadline && !settled) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%User%' AND pid<>pg_backend_pid()) AS waiting`;
      if (rows[0]?.waiting) {
        waiting = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(waiting || settled).toBe(true);
  } finally {
    release();
    await blocker;
  }
  await expect(response).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_SUSPENDED' });
  expect((await db.appointment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
    'REQUESTED',
  );
});

it('inceleyici: üst üste binen takvim süpürmeleri toplam üç deneme sınırını aşamaz', async () => {
  const { mentorId, menteeId, row } = await scene();
  await db.appointment.update({
    where: { id: row.id },
    data: { status: 'CONFIRMED', decidedAt: now },
  });
  for (const userId of [mentorId, menteeId])
    await db.consent.create({
      data: {
        userId,
        documentType: 'CROSS_BORDER_TRANSFER',
        version: CURRENT_CONSENT_VERSIONS.CROSS_BORDER_TRANSFER,
        granted: true,
      },
    });
  let release!: () => void,
    enter = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const concurrent: AppointmentDeps = {
    ...deps,
    calendar: {
      async createEvent() {
        calls++;
        enter();
        await gate;
        throw new CalendarError('CALENDAR_UNAVAILABLE', true);
      },
      async deleteEvent() {},
    },
  };
  const pending: ReturnType<typeof syncCalendarEvents>[] = [];
  try {
    for (let i = 0; i < 6; i++) {
      const entered = new Promise<void>((r) => (enter = r));
      const run = syncCalendarEvents(concurrent, { ids: [row.id] });
      pending.push(run);
      await Promise.race([entered, run]);
    }
  } finally {
    release();
    await Promise.all(pending);
  }
  expect(calls).toBe(3);
  expect((await db.appointment.findUniqueOrThrow({ where: { id: row.id } })).calendarAttempts).toBe(
    3,
  );
});
