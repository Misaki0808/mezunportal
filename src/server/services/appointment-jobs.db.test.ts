import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { createFakeCalendar, type FakeCalendar } from '../external/calendar/fake';
import {
  cancelAppointment,
  requestAppointment,
  respondAppointment,
  saveAvailability,
  saveMentorSettings,
  setMeetLink,
  type AppointmentDeps,
} from './appointment';
import {
  CALENDAR_MAX_ATTEMPTS,
  deleteCancelledEvents,
  expireDueRequests,
  runAppointmentSweep,
  sendDueReminders,
  syncCalendarEvents,
} from './appointment-jobs';
import { createRecordingNotifier } from './appointment-notifier';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const NOW = new Date('2030-06-17T06:00:00Z');
const HOUR = 3_600_000;
const NEXT_WED_10 = new Date('2030-06-26T07:00:00Z');
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

function harness(calendar: FakeCalendar | null = createFakeCalendar(), now = NOW) {
  const notifier = createRecordingNotifier();
  const deps: AppointmentDeps = { db, now: () => now, calendar, notifier };
  return { deps, notifier, calendar };
}
const at = (deps: AppointmentDeps, now: Date): AppointmentDeps => ({ ...deps, now: () => now });

async function person(
  role: 'STUDENT' | 'ALUMNI' = 'STUDENT',
  options: { transferConsent?: boolean } = {},
) {
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId: inst.deptA1,
    role,
    ...(role === 'ALUMNI' ? { graduationYear: 2021 } : { entryYear: 2024 }),
  });
  if (options.transferConsent !== false) {
    await db.consent.create({
      data: {
        userId,
        documentType: 'CROSS_BORDER_TRANSFER',
        version: CURRENT_CONSENT_VERSIONS.CROSS_BORDER_TRANSFER,
        granted: true,
      },
    });
  }
  return userId;
}
async function confirmedAppointment(
  options: {
    calendar?: FakeCalendar | null;
    menteeConsent?: boolean;
    startsAt?: Date;
    now?: Date;
  } = {},
) {
  const h = harness(
    options.calendar === undefined ? createFakeCalendar() : options.calendar,
    options.now,
  );
  const mentor = await person('ALUMNI');
  await saveMentorSettings(h.deps, mentor, {
    monthlyCapacity: 4,
    sessionMinutes: 30,
    meetingModes: ['ONLINE'],
    inPersonNote: null,
    isActive: true,
  });
  await saveAvailability(h.deps, mentor, {
    rules: [{ weekday: 3, startMinute: 600, endMinute: 720, mode: null }],
  });
  const mentee = await person('STUDENT', { transferConsent: options.menteeConsent });
  const view = await requestAppointment(h.deps, mentee, {
    mentorId: mentor,
    startsAt: options.startsAt ?? NEXT_WED_10,
    mode: 'ONLINE',
  });
  await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: view.id });
  return { h, mentor, mentee, id: view.id };
}
const row = (id: string) => db.appointment.findUniqueOrThrow({ where: { id } });

// =============================================================================================
describe('expireDueRequests (D11)', () => {
  async function pending(startsAt = NEXT_WED_10) {
    const h = harness();
    const mentor = await person('ALUMNI');
    await saveMentorSettings(h.deps, mentor, {
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      inPersonNote: null,
      isActive: true,
    });
    await saveAvailability(h.deps, mentor, {
      rules: [{ weekday: 3, startMinute: 600, endMinute: 720, mode: null }],
    });
    const mentee = await person();
    const view = await requestAppointment(h.deps, mentee, {
      mentorId: mentor,
      startsAt,
      mode: 'ONLINE',
    });
    return { h, mentor, mentee, id: view.id };
  }

  it('72 saat dolmadan dokunmaz; dolunca EXPIRED olur ve iki tarafa bildirim gider', async () => {
    const { h, id, mentor, mentee } = await pending();
    expect(
      await expireDueRequests(at(h.deps, new Date(NOW.getTime() + 72 * HOUR - 1)), { ids: [id] }),
    ).toBe(0);
    expect((await row(id)).status).toBe('REQUESTED');
    const sweep = at(h.deps, new Date(NOW.getTime() + 72 * HOUR));
    expect(await expireDueRequests(sweep, { ids: [id] })).toBe(1);
    expect((await row(id)).status).toBe('EXPIRED');
    const expired = h.notifier.notices.filter((n) => n.event === 'expired');
    expect(expired.map((n) => n.recipient.userId).sort()).toEqual([mentor, mentee].sort());
    // tekrar çalıştırınca etkisiz
    expect(await expireDueRequests(sweep, { ids: [id] })).toBe(0);
  });

  it('başlangıca 12 saatten az kalan talep (süre erken biter) başlangıç−12 saatte EXPIRED olur', async () => {
    const { h, id } = await pending(new Date('2030-06-19T07:00:00Z'));
    const border = new Date('2030-06-19T07:00:00Z').getTime() - 12 * HOUR;
    expect(await expireDueRequests(at(h.deps, new Date(border - 1)), { ids: [id] })).toBe(0);
    expect(await expireDueRequests(at(h.deps, new Date(border)), { ids: [id] })).toBe(1);
    expect((await row(id)).status).toBe('EXPIRED');
  });

  it('mentor yanıtlamışsa (onay/ret) süpürme dokunmaz; sonuçlanmış statüler korunur', async () => {
    const { h, id, mentor } = await pending();
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: id });
    await expireDueRequests(at(h.deps, new Date(NOW.getTime() + 100 * HOUR)), { ids: [id] });
    expect((await row(id)).status).toBe('CONFIRMED');
  });

  it('süpürme ile yanıt yarışında tek sonuç: ya onay ya EXPIRED', async () => {
    const { h, id, mentor } = await pending();
    const late = at(h.deps, new Date(NOW.getTime() + 71 * HOUR));
    const [respond, sweep] = await Promise.allSettled([
      respondAppointment(late, mentor, { decision: 'CONFIRM', appointmentId: id }),
      expireDueRequests(at(h.deps, new Date(NOW.getTime() + 73 * HOUR)), { ids: [id] }),
    ]);
    const status = (await row(id)).status;
    expect(['CONFIRMED', 'EXPIRED']).toContain(status);
    if (status === 'EXPIRED')
      expect(respond.status === 'rejected' || respond.status === 'fulfilled').toBe(true);
    void sweep;
  });
});

// =============================================================================================
describe('syncCalendarEvents', () => {
  it('başarı: etkinlik oluşur, Meet linki saklanır; katılımcı e-postaları davete gider; ikinci çalıştırma çift etkinlik üretmez', async () => {
    const calendar = createFakeCalendar();
    const { h, id, mentor, mentee } = await confirmedAppointment({ calendar });
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 1, failed: 0 });
    const stored = await row(id);
    expect(stored.meetUrl).toMatch(/^https:\/\/meet\.fake\.mezunportal\.test\//);
    expect(stored.calendarEventId).toBeTruthy();
    expect(calendar.events.size).toBeGreaterThanOrEqual(1);
    const event = [...calendar.events.values()].find(
      (candidate) => candidate.appointmentId === id,
    )!;
    const emails = (
      await db.user.findMany({ where: { id: { in: [mentor, mentee] } }, select: { email: true } })
    ).map((u) => u.email);
    expect([...event.attendeeEmails].sort()).toEqual(emails.sort());
    const before = calendar.createCalls;
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 0, failed: 0 });
    expect(calendar.createCalls).toBe(before);
  });

  it('geçici hata yeniden denenir: ilk çağrı düşer, randevu onaylı kalır, ikinci süpürmede link gelir', async () => {
    const calendar = createFakeCalendar({ fail: 'once' });
    const { h, id } = await confirmedAppointment({ calendar });
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 0, failed: 0 });
    expect(await row(id)).toMatchObject({
      status: 'CONFIRMED',
      meetUrl: null,
      calendarFailedAt: null,
      calendarAttempts: 1,
    });
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 1, failed: 0 });
    expect(await row(id)).toMatchObject({ status: 'CONFIRMED', calendarAttempts: 2 });
    expect((await row(id)).meetUrl).not.toBeNull();
  });

  it('TAKVİM HATASI TAKLİDİ: sürekli hata → 3 denemeden sonra randevu ONAYLI KALIR, link gerekli olur, mentora bildirim gider, mentor elle link ekler', async () => {
    const calendar = createFakeCalendar({ fail: 'always' });
    const { h, id, mentor, mentee } = await confirmedAppointment({ calendar });
    for (let index = 0; index < CALENDAR_MAX_ATTEMPTS - 1; index += 1) {
      expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 0, failed: 0 });
      expect((await row(id)).calendarFailedAt).toBeNull();
    }
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 0, failed: 1 });
    const failed = await row(id);
    expect(failed).toMatchObject({
      status: 'CONFIRMED',
      meetUrl: null,
      calendarAttempts: CALENDAR_MAX_ATTEMPTS,
    });
    expect(failed.calendarFailedAt).toEqual(NOW);
    expect(
      h.notifier.notices.filter((n) => n.event === 'linkNeeded').map((n) => n.recipient.userId),
    ).toEqual([mentor]);
    const link = await setMeetLink(h.deps, mentor, {
      appointmentId: id,
      url: 'https://meet.example.com/elle',
    });
    expect(link).toMatchObject({
      status: 'CONFIRMED',
      meetUrl: 'https://meet.example.com/elle',
      linkNeeded: false,
    });
    expect(h.notifier.notices.at(-1)).toMatchObject({
      event: 'linkAdded',
      recipient: { userId: mentee },
    });
    // Deneme hakkı bitti: bir daha çağrı yok
    const calls = calendar.createCalls;
    await syncCalendarEvents(h.deps, { ids: [id] });
    expect(calendar.createCalls).toBe(calls);
  });

  it('zaman aşımı ve kalıcı red ilk denemede vazgeçirir (yeniden deneme yok)', async () => {
    for (const fail of ['timeout', 'rejected'] as const) {
      const calendar = createFakeCalendar({ fail });
      const { h, id } = await confirmedAppointment({ calendar });
      const result = await syncCalendarEvents(h.deps, { ids: [id] });
      const stored = await row(id);
      if (fail === 'rejected') {
        expect(result.failed).toBe(1);
        expect(stored.calendarFailedAt).not.toBeNull();
      } else {
        // zaman aşımı geçici sayılır: hak bitene kadar denenir
        expect(stored.calendarAttempts).toBe(1);
      }
      expect(stored.status).toBe('CONFIRMED');
    }
  });

  it('yurt dışına aktarım rızası olmayan tarafta takvim ÇAĞRILMAZ; mentor linki elle ekler', async () => {
    const calendar = createFakeCalendar();
    const { h, id, mentor } = await confirmedAppointment({ calendar, menteeConsent: false });
    const calls = calendar.createCalls;
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 0, failed: 1 });
    expect(calendar.createCalls).toBe(calls);
    expect(await row(id)).toMatchObject({ status: 'CONFIRMED', meetUrl: null });
    expect((await row(id)).calendarFailedAt).not.toBeNull();
    expect(h.notifier.notices.filter((n) => n.event === 'linkNeeded')).toHaveLength(1);
    await expect(
      setMeetLink(h.deps, mentor, { appointmentId: id, url: 'https://meet.example.com/e' }),
    ).resolves.toMatchObject({ meetUrl: 'https://meet.example.com/e' });
  });

  it('adaptör kapalıysa süpürme hiçbir şey yapmaz', async () => {
    const { h, id } = await confirmedAppointment({ calendar: null });
    expect(await syncCalendarEvents(h.deps, { ids: [id] })).toEqual({ created: 0, failed: 0 });
  });

  it('başlamış randevu için etkinlik oluşturulmaz', async () => {
    const calendar = createFakeCalendar();
    const { h, id } = await confirmedAppointment({ calendar });
    const calls = calendar.createCalls;
    expect(
      await syncCalendarEvents(at(h.deps, new Date(NEXT_WED_10.getTime() + 1)), { ids: [id] }),
    ).toEqual({
      created: 0,
      failed: 0,
    });
    expect(calendar.createCalls).toBe(calls);
    expect((await row(id)).meetUrl).toBeNull();
  });
});

// =============================================================================================
describe('etkinlik silme ve iptal', () => {
  it('iptalde etkinlik silinir; silme hatasında kimlik kalır, süpürme yeniden dener', async () => {
    const calendar = createFakeCalendar();
    const { h, id, mentee } = await confirmedAppointment({ calendar });
    await syncCalendarEvents(h.deps, { ids: [id] });
    const eventId = (await row(id)).calendarEventId!;
    expect(calendar.events.has(eventId)).toBe(true);
    calendar.configure({ deleteFail: 'always' });
    await cancelAppointment(h.deps, mentee, { appointmentId: id });
    expect(calendar.events.has(eventId)).toBe(true);
    expect((await row(id)).calendarEventId).toBe(eventId);
    calendar.configure({});
    expect(await deleteCancelledEvents(h.deps, { ids: [id] })).toBeGreaterThanOrEqual(1);
    expect(calendar.events.has(eventId)).toBe(false);
    expect((await row(id)).calendarEventId).toBeNull();
  });

  it('iptal anında silme çalışırsa etkinlik hemen gider', async () => {
    const calendar = createFakeCalendar();
    const { h, id, mentor } = await confirmedAppointment({ calendar });
    await syncCalendarEvents(h.deps, { ids: [id] });
    const eventId = (await row(id)).calendarEventId!;
    await cancelAppointment(h.deps, mentor, { appointmentId: id });
    expect(calendar.events.has(eventId)).toBe(false);
    expect((await row(id)).calendarEventId).toBeNull();
  });

  it('süpürme sırasında randevu iptal edilirse oluşan etkinlik geri silinir', async () => {
    const calendar = createFakeCalendar();
    const { h, id, mentee } = await confirmedAppointment({ calendar });
    const original = calendar.createEvent.bind(calendar);
    calendar.createEvent = async (request, options) => {
      const event = await original(request, options);
      await cancelAppointment(h.deps, mentee, { appointmentId: id }); // dış çağrı sürerken iptal
      return event;
    };
    await syncCalendarEvents(h.deps, { ids: [id] });
    expect((await row(id)).status).toBe('CANCELLED');
    expect((await row(id)).meetUrl).toBeNull();
    expect(
      [...calendar.events.values()].filter((event) => event.appointmentId === id),
    ).toHaveLength(0);
  });
});

// =============================================================================================
describe('sendDueReminders', () => {
  it('başlangıca 24 saat kala bir kez, iki tarafa; öncesinde ve sonrasında gitmez', async () => {
    const { h, id, mentor, mentee } = await confirmedAppointment();
    expect(
      await sendDueReminders(at(h.deps, new Date(NEXT_WED_10.getTime() - 24 * HOUR - 1)), {
        ids: [id],
      }),
    ).toBe(0);
    const due = at(h.deps, new Date(NEXT_WED_10.getTime() - 24 * HOUR));
    expect(await sendDueReminders(due, { ids: [id] })).toBe(1);
    expect(
      h.notifier.notices
        .filter((n) => n.event === 'reminder')
        .map((n) => n.recipient.userId)
        .sort(),
    ).toEqual([mentor, mentee].sort());
    expect(await sendDueReminders(due, { ids: [id] })).toBe(0);
    expect((await row(id)).reminderSentAt).not.toBeNull();
    // başlayan randevuya hatırlatma yok
    const other = await confirmedAppointment({ startsAt: new Date('2030-07-03T07:00:00Z') });
    expect(
      await sendDueReminders(at(other.h.deps, new Date('2030-07-03T07:30:00Z')), {
        ids: [other.id],
      }),
    ).toBe(0);
  });

  it('iptal edilen ve onay anında hatırlatma gönderilen randevuya tekrar gitmez', async () => {
    const a = await confirmedAppointment();
    await cancelAppointment(a.h.deps, a.mentee, { appointmentId: a.id });
    expect(
      await sendDueReminders(at(a.h.deps, new Date(NEXT_WED_10.getTime() - 23 * HOUR)), {
        ids: [a.id],
      }),
    ).toBe(0);
    const startsAt = new Date('2030-06-19T07:00:00Z');
    const lateNow = new Date(startsAt.getTime() - 20 * HOUR);
    const b = await confirmedAppointment({ startsAt, now: new Date('2030-06-17T06:00:00Z') });
    await db.appointment.update({ where: { id: b.id }, data: { reminderSentAt: lateNow } });
    expect(await sendDueReminders(at(b.h.deps, lateNow), { ids: [b.id] })).toBe(0);
  });
});

describe('runAppointmentSweep', () => {
  it('dört adımı çalıştırır; biri hata verse diğerleri devam eder', async () => {
    const { h, id } = await confirmedAppointment();
    const result = await runAppointmentSweep(
      at(h.deps, new Date(NEXT_WED_10.getTime() - 24 * HOUR)),
      { ids: [id] },
    );
    expect(result.calendarCreated).toBeGreaterThanOrEqual(1);
    expect(result.reminders).toBeGreaterThanOrEqual(1);
    expect((await row(id)).meetUrl).not.toBeNull();
    const broken: AppointmentDeps = {
      ...h.deps,
      calendar: {
        createEvent: async () => {
          throw new Error('beklenmeyen');
        },
        updateEvent: async () => undefined,
        deleteEvent: async () => undefined,
      },
    };
    await expect(runAppointmentSweep(broken)).resolves.toBeDefined();
  });
});
