import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dataExportSchema } from '@/contracts/privacy';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { createFakeCalendar } from '../external/calendar/fake';
import { deleteAccount } from './accountDeletion';
import {
  getAppointment,
  requestAppointment,
  respondAppointment,
  saveAvailability,
  saveMentorSettings,
  type AppointmentDeps,
} from './appointment';
import { deleteCancelledEvents, syncCalendarEvents } from './appointment-jobs';
import { createRecordingNotifier } from './appointment-notifier';
import { buildDataExport } from './dataExport';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const NOW = new Date('2030-06-17T06:00:00Z');
const NEXT_WED_10 = new Date('2030-06-26T07:00:00Z');
const NEXT_WED_1030 = new Date('2030-06-26T07:30:00Z');
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

const calendar = createFakeCalendar();
const deps: AppointmentDeps = { db, now: () => NOW, calendar, notifier: createRecordingNotifier() };

async function person(role: 'STUDENT' | 'ALUMNI') {
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId: inst.deptA1,
    role,
    ...(role === 'ALUMNI' ? { graduationYear: 2021 } : { entryYear: 2024 }),
  });
  await db.consent.create({
    data: {
      userId,
      documentType: 'CROSS_BORDER_TRANSFER',
      version: CURRENT_CONSENT_VERSIONS.CROSS_BORDER_TRANSFER,
      granted: true,
    },
  });
  return userId;
}
async function scene() {
  const mentor = await person('ALUMNI');
  await saveMentorSettings(deps, mentor, {
    monthlyCapacity: 4,
    sessionMinutes: 30,
    meetingModes: ['ONLINE', 'IN_PERSON'],
    inPersonNote: 'Bina A oda 204',
    isActive: true,
  });
  await saveAvailability(deps, mentor, {
    rules: [{ weekday: 3, startMinute: 600, endMinute: 720, mode: null }],
  });
  const mentee = await person('STUDENT');
  const other = await person('STUDENT');
  const confirmed = await requestAppointment(deps, mentee, {
    mentorId: mentor,
    startsAt: NEXT_WED_10,
    mode: 'IN_PERSON',
    note: 'GİZLİ ÖĞRENCİ NOTU',
  });
  await respondAppointment(deps, mentor, { decision: 'CONFIRM', appointmentId: confirmed.id });
  const pending = await requestAppointment(deps, other, {
    mentorId: mentor,
    startsAt: NEXT_WED_1030,
    mode: 'ONLINE',
    note: 'Başka öğrenci notu',
  });
  return { mentor, mentee, other, confirmedId: confirmed.id, pendingId: pending.id };
}
const deletion = async (userId: string) => {
  const email = (await db.user.findUniqueOrThrow({ where: { id: userId } })).email;
  await deleteAccount(
    db,
    userId,
    { publishedContent: 'DELETE', confirmEmail: email },
    { removeStoredFiles: async () => undefined },
    NOW,
  );
};

describe('hesap silme', () => {
  it('öğrenci silince açık randevuları sistem iptal eder, notu temizlenir; mentorun satırı geçmiş olarak kalır', async () => {
    const { mentor, mentee, confirmedId } = await scene();
    await deletion(mentee);
    const row = await db.appointment.findUniqueOrThrow({ where: { id: confirmedId } });
    expect(row).toMatchObject({
      status: 'CANCELLED',
      cancelledBySystem: true,
      cancelledById: null,
      menteeNote: null,
    });
    const view = await getAppointment(deps, mentor, { appointmentId: confirmedId });
    expect(view).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM', note: null });
    expect(view.counterpart.displayName).not.toContain('Test');
    // Slot serbest kaldı
    const fresh = await person('STUDENT');
    await expect(
      requestAppointment(deps, fresh, { mentorId: mentor, startsAt: NEXT_WED_10, mode: 'ONLINE' }),
    ).resolves.toBeTruthy();
  });

  it('mentor silince bekleyen/onaylı randevular iptal, müsaitlik silinir, profil pasif, yer notu ve link temizlenir', async () => {
    const { mentor, confirmedId, pendingId } = await scene();
    await db.appointment.update({
      where: { id: confirmedId },
      data: { meetUrl: 'https://meet.example.com/kisisel' },
    });
    await deletion(mentor);
    for (const id of [confirmedId, pendingId]) {
      expect(await db.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'CANCELLED',
        cancelledBySystem: true,
        location: null,
        meetUrl: null,
      });
    }
    expect(await db.availabilityRule.count({ where: { mentorId: mentor } })).toBe(0);
    expect(await db.mentorProfile.findUniqueOrThrow({ where: { userId: mentor } })).toMatchObject({
      isActive: false,
      inPersonNote: null,
    });
  });

  it('iptal edilen onaylı online randevunun takvim etkinliği süpürmede silinir', async () => {
    const mentor = await person('ALUMNI');
    await saveMentorSettings(deps, mentor, {
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      inPersonNote: null,
      isActive: true,
    });
    await saveAvailability(deps, mentor, {
      rules: [{ weekday: 3, startMinute: 600, endMinute: 720, mode: null }],
    });
    const mentee = await person('STUDENT');
    const view = await requestAppointment(deps, mentee, {
      mentorId: mentor,
      startsAt: NEXT_WED_10,
      mode: 'ONLINE',
    });
    await respondAppointment(deps, mentor, { decision: 'CONFIRM', appointmentId: view.id });
    await syncCalendarEvents(deps, { ids: [view.id] });
    const eventId = (await db.appointment.findUniqueOrThrow({ where: { id: view.id } }))
      .calendarEventId!;
    await deletion(mentee);
    expect(calendar.events.has(eventId)).toBe(true);
    await deleteCancelledEvents(deps, { ids: [view.id] });
    expect(calendar.events.has(eventId)).toBe(false);
  });
});

describe('veri dökümü', () => {
  it('iki rolde de randevular döker; karşı taraf yalnız kimlikle; öğrenci notu yalnız yazanda; e-posta/ad yok', async () => {
    const { mentor, mentee, confirmedId } = await scene();
    const asMentee = await buildDataExport(db, mentee, NOW);
    const asMentor = await buildDataExport(db, mentor, NOW);
    expect(() => dataExportSchema.parse(asMentee)).not.toThrow();
    const own = asMentee.appointments.find((a) => a.id === confirmedId)!;
    expect(own).toMatchObject({
      role: 'MENTEE',
      counterpartId: mentor,
      mode: 'IN_PERSON',
      status: 'CONFIRMED',
      note: 'GİZLİ ÖĞRENCİ NOTU',
      location: 'Bina A oda 204',
    });
    const theirs = asMentor.appointments.find((a) => a.id === confirmedId)!;
    expect(theirs).toMatchObject({ role: 'MENTOR', counterpartId: mentee, note: null });
    expect(asMentor.appointments).toHaveLength(2);
    expect(JSON.stringify(asMentor.appointments)).not.toContain('GİZLİ ÖĞRENCİ NOTU');
    expect(JSON.stringify(asMentor.appointments)).not.toContain('Başka öğrenci notu');
    expect(JSON.stringify(asMentee.appointments)).not.toMatch(/@/);
    // randevusu olmayan kullanıcıda boş liste
    expect((await buildDataExport(db, await person('STUDENT'), NOW)).appointments).toEqual([]);
  });
});
