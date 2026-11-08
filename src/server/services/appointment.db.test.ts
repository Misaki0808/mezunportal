import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { createFakeCalendar, type FakeCalendar } from '../external/calendar/fake';
import {
  cancelAppointment,
  getAppointment,
  getAppointmentIcs,
  getMyMentorSettings,
  listMyAppointments,
  listSlots,
  requestAppointment,
  respondAppointment,
  saveAvailability,
  saveMentorSettings,
  setMeetLink,
  setPause,
  type AppointmentDeps,
} from './appointment';
import { createRecordingNotifier } from './appointment-notifier';
import { approvedCountsThisMonth } from './mentor-load';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

// 2030-06-17 pazartesi 09:00 İstanbul. Çarşamba 10:00 yerel = 07:00Z.
const NOW = new Date('2030-06-17T06:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WED_10 = new Date('2030-06-19T07:00:00Z');
const WED_1030 = new Date('2030-06-19T07:30:00Z');
const WED_11 = new Date('2030-06-19T08:00:00Z');
const NEXT_WED_10 = new Date('2030-06-26T07:00:00Z');

let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code}); gelen: ${String(error)}`).toBe(
    true,
  );
  expect(isCodedError(error) && error.code).toBe(code);
}

type Harness = {
  deps: AppointmentDeps;
  notifier: ReturnType<typeof createRecordingNotifier>;
  calendar: FakeCalendar | null;
};
function harness(options: { calendar?: FakeCalendar | null; now?: Date } = {}): Harness {
  const notifier = createRecordingNotifier();
  const calendar = options.calendar === undefined ? createFakeCalendar() : options.calendar;
  return { deps: { db, now: () => options.now ?? NOW, calendar, notifier }, notifier, calendar };
}

async function person(
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC' = 'STUDENT',
  departmentId = inst.deptA1,
  name?: string,
) {
  const userId = await createUser(db, name ? { name } : {});
  await addMembership(db, {
    userId,
    departmentId,
    role,
    ...(role === 'ALUMNI'
      ? { graduationYear: 2021 }
      : role === 'STUDENT'
        ? { entryYear: 2024 }
        : {}),
  });
  return userId;
}

/** Çarşamba 10:00–12:00 müsait, 30 dk, online (ve istenirse yüz yüze) mentor. */
async function mentorWith(
  options: {
    capacity?: number;
    modes?: ('ONLINE' | 'IN_PERSON')[];
    rules?: { weekday: number; startMinute: number; endMinute: number }[];
  } = {},
) {
  const userId = await person('ALUMNI');
  const h = harness();
  const modes = options.modes ?? ['ONLINE'];
  await saveMentorSettings(h.deps, userId, {
    monthlyCapacity: options.capacity ?? 4,
    sessionMinutes: 30,
    meetingModes: modes,
    inPersonNote: modes.includes('IN_PERSON') ? 'Bina A, kat 2, oda 204' : null,
    isActive: true,
  });
  await saveAvailability(h.deps, userId, {
    rules: (options.rules ?? [{ weekday: 3, startMinute: 600, endMinute: 720 }]).map((rule) => ({
      ...rule,
      mode: null,
    })),
  });
  return userId;
}
const dbRow = (id: string) => db.appointment.findUniqueOrThrow({ where: { id } });
const ask = (
  h: Harness,
  mentee: string,
  mentorId: string,
  startsAt = WED_10,
  mode: 'ONLINE' | 'IN_PERSON' = 'ONLINE',
  note?: string,
) => requestAppointment(h.deps, mentee, { mentorId, startsAt, mode, ...(note ? { note } : {}) });

// =============================================================================================
describe('mentor ayarları', () => {
  it('mezun/akademisyen mentor olabilir; öğrenci K-08’i geçmeden olamaz; doğrulanmamış kullanamaz', async () => {
    const h = harness();
    const base = {
      monthlyCapacity: 4,
      sessionMinutes: 30 as const,
      meetingModes: ['ONLINE' as const],
      inPersonNote: null,
      isActive: true,
    };
    for (const role of ['ALUMNI', 'ACADEMIC'] as const) {
      const userId = await person(role);
      expect((await getMyMentorSettings(h.deps, userId)).eligible).toBe(true);
      expect((await saveMentorSettings(h.deps, userId, base)).settings).toMatchObject({
        monthlyCapacity: 4,
        isActive: true,
      });
    }
    const student = await person('STUDENT');
    expect((await getMyMentorSettings(h.deps, student)).eligible).toBe(false);
    await expectCode(saveMentorSettings(h.deps, student, base), 'MENTOR_NOT_ELIGIBLE');
    await expectCode(saveAvailability(h.deps, student, { rules: [] }), 'MENTOR_NOT_ELIGIBLE');
    await expectCode(setPause(h.deps, student, { pausedUntil: null }), 'MENTOR_NOT_ELIGIBLE');
    expect(await db.mentorProfile.count({ where: { userId: student } })).toBe(0);
    const unverified = await createUser(db);
    await addMembership(db, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      status: 'PENDING',
      graduationYear: 2020,
    });
    await expectCode(saveMentorSettings(h.deps, unverified, base), 'AUTH_NOT_VERIFIED');
    await expectCode(getMyMentorSettings(h.deps, randomUUID()), 'AUTH_UNAUTHENTICATED');
  });

  it('yüz yüze not yoksa sözleşme reddeder; yüz yüze kapatılınca not temizlenir; ayar güncellenebilir', async () => {
    const h = harness();
    const userId = await person('ACADEMIC');
    await expect(
      saveMentorSettings(h.deps, userId, {
        monthlyCapacity: 2,
        sessionMinutes: 20,
        meetingModes: ['IN_PERSON'],
        inPersonNote: null,
        isActive: true,
      }),
    ).rejects.toThrow();
    const both = await saveMentorSettings(h.deps, userId, {
      monthlyCapacity: 2,
      sessionMinutes: 20,
      meetingModes: ['IN_PERSON', 'ONLINE'],
      inPersonNote: 'Ofis 12',
      isActive: true,
    });
    expect(both.settings?.inPersonNote).toBe('Ofis 12');
    const online = await saveMentorSettings(h.deps, userId, {
      monthlyCapacity: 5,
      sessionMinutes: 15,
      meetingModes: ['ONLINE'],
      inPersonNote: 'Ofis 12',
      isActive: false,
    });
    expect(online.settings).toMatchObject({
      inPersonNote: null,
      monthlyCapacity: 5,
      sessionMinutes: 15,
      isActive: false,
    });
  });

  it('haftalık müsaitlik yerine konur; çakışma doğrulama/DB tarafından reddedilir', async () => {
    const h = harness();
    const userId = await person('ALUMNI');
    const first = await saveAvailability(h.deps, userId, {
      rules: [
        { weekday: 1, startMinute: 540, endMinute: 600, mode: null },
        { weekday: 3, startMinute: 600, endMinute: 720, mode: 'ONLINE' },
      ],
    });
    expect(first.rules).toHaveLength(2);
    const replaced = await saveAvailability(h.deps, userId, {
      rules: [{ weekday: 5, startMinute: 600, endMinute: 660, mode: null }],
    });
    expect(replaced.rules).toEqual([{ weekday: 5, startMinute: 600, endMinute: 660, mode: null }]);
    expect(await db.availabilityRule.count({ where: { mentorId: userId } })).toBe(1);
    await expect(
      saveAvailability(h.deps, userId, {
        rules: [
          { weekday: 1, startMinute: 540, endMinute: 660, mode: null },
          { weekday: 1, startMinute: 600, endMinute: 700, mode: null },
        ],
      }),
    ).rejects.toThrow();
    expect((await getMyMentorSettings(h.deps, userId)).rules).toHaveLength(1); // başarısız yazım eskiyi bozmaz
    // DB kısıtı doğrudan da çakışmayı reddeder
    await expect(
      db.availabilityRule.createMany({
        data: [{ mentorId: userId, weekday: 5, startMinute: 630, endMinute: 700 }],
      }),
    ).rejects.toThrow(/no_overlap/);
    await expect(
      db.availabilityRule.create({
        data: { mentorId: userId, weekday: 2, startMinute: 541, endMinute: 600 },
      }),
    ).rejects.toThrow(/shape_check/);
  });

  it('müsait değilim: gelecek tarih, en çok 365 gün; null kapatır; profil yoksa mentor değil', async () => {
    const h = harness();
    const userId = await mentorWith();
    const until = new Date(NOW.getTime() + 10 * DAY);
    expect((await setPause(h.deps, userId, { pausedUntil: until })).settings?.pausedUntil).toEqual(
      until,
    );
    expect(
      (await setPause(h.deps, userId, { pausedUntil: null })).settings?.pausedUntil,
    ).toBeNull();
    await expectCode(
      setPause(h.deps, userId, { pausedUntil: new Date(NOW.getTime() - 1000) }),
      'VALIDATION_INVALID',
    );
    await expectCode(
      setPause(h.deps, userId, { pausedUntil: new Date(NOW.getTime() + 366 * DAY) }),
      'VALIDATION_INVALID',
    );
    const noProfile = await person('ALUMNI');
    await expectCode(setPause(h.deps, noProfile, { pausedUntil: until }), 'MENTOR_NOT_ELIGIBLE');
  });
});

// =============================================================================================
describe('slotlar', () => {
  it('yalnız görünür mentorun slotları; e-posta paylaşımı bildirimi; yüz yüze notu', async () => {
    const h = harness();
    const mentor = await mentorWith({ modes: ['ONLINE', 'IN_PERSON'] });
    const student = await person();
    const list = await listSlots(h.deps, student, { mentorId: mentor });
    expect(list.emailShared).toBe(true);
    expect(list.mentor).toMatchObject({
      userId: mentor,
      sessionMinutes: 30,
      inPersonNote: 'Bina A, kat 2, oda 204',
    });
    expect(list.slots.slice(0, 4).map((slot) => slot.startsAt.toISOString())).toEqual([
      WED_10.toISOString(),
      WED_1030.toISOString(),
      WED_11.toISOString(),
      '2030-06-19T08:30:00.000Z',
    ]);
    expect(list.slots[0]!.modes).toEqual(['ONLINE', 'IN_PERSON']);
    expect(list.unavailableReason).toBeNull();
    expect(JSON.stringify(list)).not.toMatch(/@/);
  });

  it('görünmeyen mentor (başka üniversite, pasif, kendisi, olmayan) RESOURCE_NOT_FOUND', async () => {
    const h = harness();
    const other = await createInstitution(db);
    const foreign = await person('ALUMNI', other.deptA1);
    await saveMentorSettings(h.deps, foreign, {
      monthlyCapacity: 2,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      inPersonNote: null,
      isActive: true,
    });
    const inactive = await person('ALUMNI');
    await saveMentorSettings(h.deps, inactive, {
      monthlyCapacity: 2,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      inPersonNote: null,
      isActive: false,
    });
    const mentor = await mentorWith();
    const student = await person();
    for (const target of [foreign, inactive, randomUUID()]) {
      await expectCode(listSlots(h.deps, student, { mentorId: target }), 'RESOURCE_NOT_FOUND');
    }
    await expectCode(listSlots(h.deps, mentor, { mentorId: mentor }), 'RESOURCE_NOT_FOUND');
  });

  it('dolu slot çıkar; duraklatma ve dolu kapasite sebep döner; müsaitlik yoksa NO_AVAILABILITY', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const a = await person();
    const b = await person();
    await ask(h, a, mentor, WED_1030);
    const slots = (await listSlots(h.deps, b, { mentorId: mentor })).slots.map((slot) =>
      slot.startsAt.toISOString(),
    );
    expect(slots).not.toContain(WED_1030.toISOString());
    expect(slots).toContain(WED_10.toISOString());
    expect(slots).toContain(WED_11.toISOString());

    const paused = await mentorWith();
    await setPause(h.deps, paused, { pausedUntil: new Date(NOW.getTime() + 30 * DAY) });
    expect(await listSlots(h.deps, b, { mentorId: paused })).toMatchObject({
      slots: [],
      unavailableReason: 'PAUSED',
    });

    const empty = await mentorWith({ rules: [] });
    expect(await listSlots(h.deps, b, { mentorId: empty })).toMatchObject({
      slots: [],
      unavailableReason: 'NO_AVAILABILITY',
    });
  });
});

// =============================================================================================
describe('talep', () => {
  it('slota talep: REQUESTED, D11 son tarihi, mentora bildirim; görünümde e-posta yok', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const student = await person('STUDENT', inst.deptA1, 'Öğrenci Ayşe');
    const view = await ask(
      h,
      student,
      mentor,
      NEXT_WED_10,
      'ONLINE',
      'CV konusunda konuşmak istiyorum',
    );
    expect(view).toMatchObject({
      status: 'REQUESTED',
      role: 'MENTEE',
      mode: 'ONLINE',
      note: 'CV konusunda konuşmak istiyorum',
    });
    // talep + 72 saat (başlangıç çok uzakta)
    expect(view.expiresAt).toEqual(new Date(NOW.getTime() + 72 * HOUR));
    expect(view.actions).toMatchObject({
      canCancel: true,
      canConfirm: false,
      canSetLink: false,
      canDownloadIcs: false,
    });
    expect(JSON.stringify(view)).not.toMatch(/@/);
    expect(h.notifier.notices).toHaveLength(1);
    expect(h.notifier.notices[0]).toMatchObject({
      event: 'requested',
      counterpartName: 'Öğrenci Ayşe',
      recipient: { userId: mentor },
    });
    // başlangıca yakın slot: 12 saat önce sınırı daha erken
    const close = await ask(h, await person(), mentor, WED_10);
    expect(close.expiresAt).toEqual(new Date(WED_10.getTime() - 12 * HOUR));
  });

  it('üretilmeyen slot, yanlış biçim, 24 saatten yakın zaman geçersiz', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const student = await person();
    for (const [startsAt, mode] of [
      [new Date(WED_10.getTime() + 60_000), 'ONLINE'], // gridde değil
      [new Date('2030-06-19T06:00:00Z'), 'ONLINE'], // müsaitlik dışı saat (09:00)
      [new Date('2030-06-20T07:00:00Z'), 'ONLINE'], // müsait olmayan gün
      [WED_10, 'IN_PERSON'], // mentor yüz yüze sunmuyor
      [new Date('2030-06-17T07:00:00Z'), 'ONLINE'], // geçmiş/yakın
    ] as const) {
      await expectCode(ask(h, student, mentor, startsAt, mode), 'APPOINTMENT_SLOT_INVALID');
    }
    expect(await db.appointment.count({ where: { menteeId: student } })).toBe(0);
  });

  it('duraklatılmış mentora talep APPOINTMENT_MENTOR_UNAVAILABLE', async () => {
    const h = harness();
    const mentor = await mentorWith();
    await setPause(h.deps, mentor, { pausedUntil: new Date(NOW.getTime() + 30 * DAY) });
    await expectCode(ask(h, await person(), mentor), 'APPOINTMENT_MENTOR_UNAVAILABLE');
  });

  it('ayın kapasitesi dolduysa o aya talep APPOINTMENT_CAPACITY_FULL (slot da listelenmez)', async () => {
    const h = harness();
    const mentor = await mentorWith({ capacity: 1 });
    const first = await ask(h, await person(), mentor, NEXT_WED_10);
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: first.id });
    const other = await person();
    const later = new Date(NEXT_WED_10.getTime() + 30 * 60_000);
    await expectCode(ask(h, other, mentor, later), 'APPOINTMENT_CAPACITY_FULL');
    const listed = (await listSlots(h.deps, other, { mentorId: mentor })).slots.map((slot) =>
      slot.startsAt.getTime(),
    );
    expect(listed).not.toContain(later.getTime());
    // Temmuz ayı henüz boş
    expect(listed).toContain(new Date('2030-07-03T07:00:00Z').getTime());
  });

  it('aynı mentora yanıt bekleyen ikinci talep reddedilir; sonuçlanınca yenisi açılabilir', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const student = await person();
    const first = await ask(h, student, mentor, WED_10);
    await expectCode(ask(h, student, mentor, WED_11), 'APPOINTMENT_OPEN_REQUEST_EXISTS');
    await cancelAppointment(h.deps, student, { appointmentId: first.id });
    await expect(ask(h, student, mentor, WED_11)).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('öğrencinin kendi çakışan randevusu (başka mentorla) engellenir', async () => {
    const h = harness();
    const m1 = await mentorWith();
    const m2 = await mentorWith();
    const student = await person();
    await ask(h, student, m1, WED_10);
    await expectCode(ask(h, student, m2, WED_10), 'APPOINTMENT_SLOT_TAKEN');
  });

  it('hız sınırı: 24 saatte 10 talep; 11. RATE_LIMITED ve kayıt yazılmaz', async () => {
    const h = harness();
    const student = await person();
    const times = [0, 1, 2, 3].flatMap((slot) =>
      [0, 7, 14].map((week) => new Date(WED_10.getTime() + week * DAY + slot * 30 * 60_000)),
    );
    for (let index = 0; index < 10; index += 1) {
      const mentor = await mentorWith({
        rules: [{ weekday: 3, startMinute: 600, endMinute: 720 }],
      });
      await ask(h, student, mentor, times[index]!);
    }
    const mentor = await mentorWith();
    await expectCode(ask(h, student, mentor), 'RATE_LIMITED');
    expect(await db.appointment.count({ where: { menteeId: student } })).toBe(10);
  });

  it('yetkisiz: doğrulanmamış, askıdaki öğrenci ve kendi kendine', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const unverified = await createUser(db);
    await addMembership(db, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      status: 'PENDING',
      entryYear: 2024,
    });
    await expectCode(ask(h, unverified, mentor), 'AUTH_NOT_VERIFIED');
    const suspended = await person();
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    await expectCode(ask(h, suspended, mentor), 'AUTH_ACCOUNT_SUSPENDED');
    await expectCode(ask(h, mentor, mentor), 'RESOURCE_NOT_FOUND');
  });

  it('EŞZAMANLI: aynı slota birden çok öğrenci — yalnız biri alır, kalanı APPOINTMENT_SLOT_TAKEN (exclusion)', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const students = await Promise.all(Array.from({ length: 6 }, () => person()));
    const results = await Promise.allSettled(
      students.map((student) => ask(h, student, mentor, WED_10)),
    );
    const ok = results.filter((result) => result.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected')
        expect((result.reason as { code: string }).code).toBe('APPOINTMENT_SLOT_TAKEN');
    }
    expect(await db.appointment.count({ where: { mentorId: mentor, status: 'REQUESTED' } })).toBe(
      1,
    );
  });

  it('EŞZAMANLI: aynı öğrenciden aynı mentora çift tıklama — tek talep', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const student = await person();
    const results = await Promise.allSettled([
      ask(h, student, mentor, WED_10),
      ask(h, student, mentor, WED_11),
      ask(h, student, mentor, WED_1030),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.appointment.count({ where: { menteeId: student } })).toBe(1);
  });
});

// =============================================================================================
describe('yanıt', () => {
  async function requested(
    options: {
      capacity?: number;
      modes?: ('ONLINE' | 'IN_PERSON')[];
      mode?: 'ONLINE' | 'IN_PERSON';
      startsAt?: Date;
      calendar?: FakeCalendar | null;
    } = {},
  ) {
    const h = harness({ calendar: options.calendar });
    const mentor = await mentorWith({ capacity: options.capacity, modes: options.modes });
    const mentee = await person('STUDENT', inst.deptA1, 'Öğrenci Can');
    const view = await ask(
      h,
      mentee,
      mentor,
      options.startsAt ?? NEXT_WED_10,
      options.mode ?? 'ONLINE',
    );
    return { h, mentor, mentee, id: view.id };
  }

  it('onay: CONFIRMED, karar anı, öğrenciye bildirim; takvim açıkken link süpürmeyle gelir', async () => {
    const { h, mentor, id } = await requested();
    const view = await respondAppointment(h.deps, mentor, {
      decision: 'CONFIRM',
      appointmentId: id,
    });
    expect(view).toMatchObject({
      status: 'CONFIRMED',
      role: 'MENTOR',
      decidedAt: NOW,
      linkNeeded: false,
    });
    expect(view.actions).toMatchObject({
      canCancel: true,
      canDownloadIcs: true,
      canConfirm: false,
    });
    expect(h.notifier.notices.at(-1)).toMatchObject({
      event: 'confirmed',
      counterpartName: 'Test Kullanıcı',
    });
    expect(await dbRow(id)).toMatchObject({
      status: 'CONFIRMED',
      calendarFailedAt: null,
      meetUrl: null,
    });
  });

  it('takvim KAPALIYSA online onay yine olur, link hemen "gerekli" ve mentora bildirim gider', async () => {
    const { h, mentor, id } = await requested({ calendar: null });
    const view = await respondAppointment(h.deps, mentor, {
      decision: 'CONFIRM',
      appointmentId: id,
    });
    expect(view).toMatchObject({ status: 'CONFIRMED', linkNeeded: true, meetUrl: null });
    expect(view.actions.canSetLink).toBe(true);
    expect(h.notifier.notices.map((n) => n.event)).toEqual([
      'requested',
      'confirmed',
      'linkNeeded',
    ]);
  });

  it('yüz yüze onayda yer notu randevuya kopyalanır; sonradan ayar değişse de randevu değişmez', async () => {
    const { h, mentor, id } = await requested({ modes: ['IN_PERSON'], mode: 'IN_PERSON' });
    const view = await respondAppointment(h.deps, mentor, {
      decision: 'CONFIRM',
      appointmentId: id,
    });
    expect(view.location).toBe('Bina A, kat 2, oda 204');
    expect(view.linkNeeded).toBe(false);
    await saveMentorSettings(h.deps, mentor, {
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['IN_PERSON'],
      inPersonNote: 'Yeni oda',
      isActive: true,
    });
    expect((await dbRow(id)).location).toBe('Bina A, kat 2, oda 204');
  });

  it('ret: DECLINED, gerekçe öğrenciye gider; tekrar yanıtlanamaz', async () => {
    const { h, mentor, mentee, id } = await requested();
    const view = await respondAppointment(h.deps, mentor, {
      decision: 'DECLINE',
      appointmentId: id,
      reason: 'O hafta seyahatteyim',
    });
    expect(view.status).toBe('DECLINED');
    expect(h.notifier.notices.at(-1)).toMatchObject({
      event: 'declined',
      reason: 'O hafta seyahatteyim',
      recipient: { userId: mentee },
    });
    expect((await getAppointment(h.deps, mentee, { appointmentId: id })).cancelReason).toBe(
      'O hafta seyahatteyim',
    );
    await expectCode(
      respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: id }),
      'APPOINTMENT_NOT_REQUESTED',
    );
  });

  it('yalnız randevunun mentoru yanıtlar; öğrenci ve yabancı RESOURCE_NOT_FOUND', async () => {
    const { h, mentee, id } = await requested();
    const stranger = await mentorWith();
    await expectCode(
      respondAppointment(h.deps, mentee, { decision: 'CONFIRM', appointmentId: id }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      respondAppointment(h.deps, stranger, { decision: 'CONFIRM', appointmentId: id }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      respondAppointment(h.deps, stranger, { decision: 'CONFIRM', appointmentId: randomUUID() }),
      'RESOURCE_NOT_FOUND',
    );
    expect((await dbRow(id)).status).toBe('REQUESTED');
  });

  it('yanıt süresi dolduysa APPOINTMENT_EXPIRED; süpürme EXPIRED yapmışsa da', async () => {
    const { h, mentor, id } = await requested();
    const late = { ...h.deps, now: () => new Date(NOW.getTime() + 72 * HOUR) };
    await expectCode(
      respondAppointment(late, mentor, { decision: 'CONFIRM', appointmentId: id }),
      'APPOINTMENT_EXPIRED',
    );
    await db.appointment.update({ where: { id }, data: { status: 'EXPIRED' } });
    await expectCode(
      respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: id }),
      'APPOINTMENT_EXPIRED',
    );
  });

  it('KAPASİTE: ayın kapasitesi dolunca onay APPOINTMENT_CAPACITY_FULL; düğme sebebi görünümde; ret serbest', async () => {
    const h = harness();
    const mentor = await mentorWith({ capacity: 1 });
    const [a, b] = [await person(), await person()];
    const first = await ask(h, a, mentor, NEXT_WED_10);
    const second = await ask(h, b, mentor, new Date(NEXT_WED_10.getTime() + 30 * 60_000));
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: first.id });
    const list = await listMyAppointments(h.deps, mentor, {
      role: 'MENTOR',
      statuses: ['REQUESTED'],
    });
    expect(list.items[0]!.actions).toMatchObject({
      canConfirm: false,
      confirmBlockedReason: 'CAPACITY_FULL',
      canDecline: true,
    });
    await expectCode(
      respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: second.id }),
      'APPOINTMENT_CAPACITY_FULL',
    );
    expect((await dbRow(second.id)).status).toBe('REQUESTED');
    await expect(
      respondAppointment(h.deps, mentor, { decision: 'DECLINE', appointmentId: second.id }),
    ).resolves.toMatchObject({ status: 'DECLINED' });
  });

  it('kapasite takvim ayına göredir: ay sonu/ay başı farklı sayılır', async () => {
    const h = harness();
    const mentor = await mentorWith({
      capacity: 1,
      rules: [
        { weekday: 3, startMinute: 600, endMinute: 660 },
        { weekday: 1, startMinute: 600, endMinute: 660 },
      ],
    });
    const students = [await person(), await person()];
    // 2030-06-26 çarşamba (haziran) ve 2030-07-03 çarşamba (temmuz)
    const june = await ask(h, students[0]!, mentor, NEXT_WED_10);
    const july = await ask(h, students[1]!, mentor, new Date('2030-07-03T07:00:00Z'));
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: june.id });
    await expect(
      respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: july.id }),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
  });

  it('EŞZAMANLI onaylar: kapasite 1 iken iki talep aynı anda onaylanırsa yalnız biri geçer', async () => {
    const h = harness();
    const mentor = await mentorWith({ capacity: 1 });
    const views = [];
    for (let index = 0; index < 3; index += 1) {
      views.push(
        await ask(h, await person(), mentor, new Date(NEXT_WED_10.getTime() + index * 30 * 60_000)),
      );
    }
    const results = await Promise.allSettled(
      views.map((view) =>
        respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: view.id }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results)
      if (r.status === 'rejected')
        expect((r.reason as { code: string }).code).toBe('APPOINTMENT_CAPACITY_FULL');
    expect(await db.appointment.count({ where: { mentorId: mentor, status: 'CONFIRMED' } })).toBe(
      1,
    );
  });

  it('onay hatırlatma anından sonra gelirse hatırlatma onayla birlikte gider, süpürme tekrar göndermez', async () => {
    const { h, mentor, id } = await requested({ startsAt: WED_10 });
    // Başlangıca 20 saat kala onay
    const lateNow = new Date(WED_10.getTime() - 20 * HOUR);
    await db.appointment.update({
      where: { id },
      data: { expiresAt: new Date(WED_10.getTime() - 12 * HOUR) },
    });
    const late = { ...h.deps, now: () => lateNow };
    await respondAppointment(late, mentor, { decision: 'CONFIRM', appointmentId: id });
    expect(h.notifier.notices.at(-1)).toMatchObject({ event: 'confirmed', withReminder: true });
    expect((await dbRow(id)).reminderSentAt).toEqual(lateNow);
  });
});

// =============================================================================================
describe('iptal ve link', () => {
  async function confirmed(options: { calendar?: FakeCalendar | null } = {}) {
    const h = harness({ calendar: options.calendar });
    const mentor = await mentorWith();
    const mentee = await person();
    const view = await ask(h, mentee, mentor, NEXT_WED_10);
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: view.id });
    return { h, mentor, mentee, id: view.id };
  }

  it('öğrenci talebini geri çeker; mentor bekleyen talebi iptal edemez (reddeder)', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const mentee = await person();
    const view = await ask(h, mentee, mentor, NEXT_WED_10);
    await expectCode(
      cancelAppointment(h.deps, mentor, { appointmentId: view.id }),
      'APPOINTMENT_NOT_CANCELLABLE',
    );
    const cancelled = await cancelAppointment(h.deps, mentee, {
      appointmentId: view.id,
      reason: 'Vazgeçtim',
    });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'MENTEE',
      cancelReason: 'Vazgeçtim',
    });
    expect(h.notifier.notices.at(-1)).toMatchObject({
      event: 'cancelled',
      recipient: { userId: mentor },
    });
    await expectCode(
      cancelAppointment(h.deps, mentee, { appointmentId: view.id }),
      'APPOINTMENT_NOT_CANCELLABLE',
    );
  });

  it('onaylı randevu iki taraftan da iptal edilir; başlamışsa edilmez; yabancı göremez', async () => {
    const a = await confirmed();
    expect(await cancelAppointment(a.h.deps, a.mentor, { appointmentId: a.id })).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'MENTOR',
    });
    const b = await confirmed();
    expect(
      await cancelAppointment(b.h.deps, b.mentee, { appointmentId: b.id, reason: 'Sınavım çıktı' }),
    ).toMatchObject({ cancelledBy: 'MENTEE' });
    const c = await confirmed();
    const stranger = await person();
    await expectCode(
      cancelAppointment(c.h.deps, stranger, { appointmentId: c.id }),
      'RESOURCE_NOT_FOUND',
    );
    const started = { ...c.h.deps, now: () => new Date(NEXT_WED_10.getTime() + 1) };
    await expectCode(
      cancelAppointment(started, c.mentee, { appointmentId: c.id }),
      'APPOINTMENT_NOT_CANCELLABLE',
    );
    expect((await dbRow(c.id)).status).toBe('CONFIRMED');
  });

  it('dolu slot listede/talepte yok; iptal slotu serbest bırakır (exclusion yalnız bekleyen/onaylıyı tutar)', async () => {
    const a = await confirmed();
    const other = await person();
    await expectCode(ask(a.h, other, a.mentor, NEXT_WED_10), 'APPOINTMENT_SLOT_TAKEN');
    await cancelAppointment(a.h.deps, a.mentee, { appointmentId: a.id });
    await expect(ask(a.h, other, a.mentor, NEXT_WED_10)).resolves.toMatchObject({
      status: 'REQUESTED',
    });
  });

  it('elle link: yalnız mentor, yalnız takvim linki üretemediyse; https; öğrenciye bildirim', async () => {
    const { h, mentor, mentee, id } = await confirmed({ calendar: null });
    await expectCode(
      setMeetLink(h.deps, mentee, { appointmentId: id, url: 'https://meet.example.com/x' }),
      'RESOURCE_NOT_FOUND',
    );
    await expect(
      setMeetLink(h.deps, mentor, { appointmentId: id, url: 'http://meet.example.com/x' }),
    ).rejects.toThrow();
    const view = await setMeetLink(h.deps, mentor, {
      appointmentId: id,
      url: 'https://meet.example.com/x',
    });
    expect(view).toMatchObject({ meetUrl: 'https://meet.example.com/x', linkNeeded: false });
    expect(h.notifier.notices.at(-1)).toMatchObject({
      event: 'linkAdded',
      meetUrl: 'https://meet.example.com/x',
    });
    await expectCode(
      setMeetLink(h.deps, mentor, { appointmentId: id, url: 'https://meet.example.com/y' }),
      'APPOINTMENT_LINK_NOT_NEEDED',
    );
  });

  it('link gerekmiyorsa (bekleyen, iptal, takvim henüz denemede) eklenemez', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const mentee = await person();
    const view = await ask(h, mentee, mentor, NEXT_WED_10);
    await expectCode(
      setMeetLink(h.deps, mentor, { appointmentId: view.id, url: 'https://meet.example.com/x' }),
      'APPOINTMENT_LINK_NOT_NEEDED',
    );
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: view.id }); // takvim açık: süpürme bekleniyor
    await expectCode(
      setMeetLink(h.deps, mentor, { appointmentId: view.id, url: 'https://meet.example.com/x' }),
      'APPOINTMENT_LINK_NOT_NEEDED',
    );
  });
});

// =============================================================================================
describe('okuma', () => {
  it('liste yalnız kendi randevuları; rol ve durum süzgeci; sayfalama; karşı taraf adı, e-posta yok', async () => {
    const h = harness();
    const mentor = await mentorWith({ capacity: 10 });
    const mentee = await person('STUDENT', inst.deptA1, 'Öğrenci Deniz');
    const stranger = await person();
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const m = await person();
      ids.push((await ask(h, m, mentor, new Date(NEXT_WED_10.getTime() + index * 30 * 60_000))).id);
    }
    const own = await ask(h, mentee, await mentorWith(), NEXT_WED_10);
    const asMentor = await listMyAppointments(h.deps, mentor, { role: 'MENTOR', limit: 2 });
    expect(asMentor.items).toHaveLength(2);
    expect(asMentor.nextCursor).not.toBeNull();
    const rest = await listMyAppointments(h.deps, mentor, {
      role: 'MENTOR',
      limit: 2,
      cursor: asMentor.nextCursor!,
    });
    expect([...asMentor.items, ...rest.items].map((i) => i.id).sort()).toEqual([...ids].sort());
    expect(asMentor.items.every((item) => item.role === 'MENTOR')).toBe(true);
    expect(JSON.stringify(asMentor)).not.toMatch(/@/);
    const asMentee = await listMyAppointments(h.deps, mentee, { role: 'MENTEE' });
    expect(asMentee.items.map((i) => i.id)).toEqual([own.id]);
    expect(asMentee.items[0]!.counterpart.userId).not.toBe(mentee);
    expect((await listMyAppointments(h.deps, stranger, { role: 'MENTEE' })).items).toEqual([]);
    expect(
      (await listMyAppointments(h.deps, mentor, { role: 'MENTOR', statuses: ['CONFIRMED'] })).items,
    ).toEqual([]);
    // rol başkasının randevusuna yetki vermez
    expect((await listMyAppointments(h.deps, stranger, { role: 'MENTOR' })).items).toEqual([]);
  });

  it('randevu ayrıntısı yalnız katılımcıya; yabancıya RESOURCE_NOT_FOUND', async () => {
    const h = harness();
    const mentor = await mentorWith();
    const mentee = await person();
    const view = await ask(h, mentee, mentor, NEXT_WED_10);
    expect((await getAppointment(h.deps, mentor, { appointmentId: view.id })).role).toBe('MENTOR');
    expect((await getAppointment(h.deps, mentee, { appointmentId: view.id })).role).toBe('MENTEE');
    await expectCode(
      getAppointment(h.deps, await person(), { appointmentId: view.id }),
      'RESOURCE_NOT_FOUND',
    );
  });

  it('.ics: onaylı randevuda iki katılımcıya, içerikte e-posta yok; bekleyen/yabancı 404', async () => {
    const h = harness({ calendar: null });
    const mentor = await mentorWith();
    const mentee = await person('STUDENT', inst.deptA1, 'Öğrenci Ece');
    const view = await ask(h, mentee, mentor, NEXT_WED_10, 'ONLINE', 'Merhaba, kısa bir not');
    await expectCode(
      getAppointmentIcs(h.deps, mentee, { appointmentId: view.id }),
      'RESOURCE_NOT_FOUND',
    );
    await respondAppointment(h.deps, mentor, { decision: 'CONFIRM', appointmentId: view.id });
    await setMeetLink(h.deps, mentor, {
      appointmentId: view.id,
      url: 'https://meet.example.com/ics',
    });
    for (const user of [mentor, mentee]) {
      const text = await getAppointmentIcs(h.deps, user, { appointmentId: view.id });
      expect(text).toContain('DTSTART:20300626T070000Z');
      expect(text).toContain('URL:https://meet.example.com/ics');
      expect(text).not.toMatch(/@(?!mezunportal)/);
    }
    await expectCode(
      getAppointmentIcs(h.deps, await person(), { appointmentId: view.id }),
      'RESOURCE_NOT_FOUND',
    );
  });
});

// =============================================================================================
describe('veritabanı kısıtları', () => {
  async function pair() {
    return { mentor: await person('ALUMNI'), mentee: await person() };
  }
  const row = (
    mentorId: string,
    menteeId: string,
    startsAt: Date,
    minutes = 30,
    status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'DECLINED' = 'REQUESTED',
  ) => ({
    mentorId,
    menteeId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    mode: 'ONLINE' as const,
    status,
    expiresAt: new Date(startsAt.getTime() - 12 * HOUR),
    ...(status === 'CONFIRMED' || status === 'DECLINED' ? { decidedAt: NOW } : {}),
  });

  it('aynı mentorun bekleyen/onaylı aralıkları çakışamaz; yan yana ve iptal edilmiş serbest', async () => {
    const { mentor, mentee } = await pair();
    const other = await person();
    await db.appointment.create({ data: row(mentor, mentee, WED_10) });
    await expect(
      db.appointment.create({ data: row(mentor, other, new Date(WED_10.getTime() + 15 * 60_000)) }),
    ).rejects.toThrow(/no_overlap/);
    await expect(
      db.appointment.create({ data: row(mentor, other, WED_1030) }),
    ).resolves.toBeTruthy(); // bitişik
    await db.appointment.create({ data: row(mentor, await person(), WED_11, 30, 'CANCELLED') });
    await expect(
      db.appointment.create({ data: row(mentor, await person(), WED_11) }),
    ).resolves.toBeTruthy();
  });

  it('aynı öğrencinin aralıkları da çakışamaz', async () => {
    const mentee = await person();
    await db.appointment.create({ data: row(await person('ALUMNI'), mentee, WED_10) });
    await expect(
      db.appointment.create({
        data: row(await person('ALUMNI'), mentee, new Date(WED_10.getTime() + 10 * 60_000)),
      }),
    ).rejects.toThrow(/no_overlap/);
  });

  it('bekleyen tek talep, kendi kendine randevu, ters aralık, https olmayan link, uzun not reddedilir', async () => {
    const { mentor, mentee } = await pair();
    await db.appointment.create({ data: row(mentor, mentee, WED_10) });
    await expect(db.appointment.create({ data: row(mentor, mentee, WED_11) })).rejects.toThrow(
      /one_open_request/,
    );
    await expect(db.appointment.create({ data: row(mentor, mentor, WED_11) })).rejects.toThrow(
      /shape_check/,
    );
    await expect(
      db.appointment.create({ data: { ...row(mentor, await person(), WED_11), endsAt: WED_10 } }),
    ).rejects.toThrow(/shape_check/);
    await expect(
      db.appointment.create({
        data: {
          ...row(mentor, await person(), WED_11, 30, 'CONFIRMED'),
          meetUrl: 'http://x.com/a',
        },
      }),
    ).rejects.toThrow(/shape_check/);
    await expect(
      db.appointment.create({
        data: { ...row(mentor, await person(), WED_11), menteeNote: 'x'.repeat(501) },
      }),
    ).rejects.toThrow(/shape_check/);
    await expect(
      db.appointment.create({
        data: {
          ...row(mentor, await person(), WED_11, 30, 'DECLINED'),
          cancelReason: 'iptal alanı yalnız iptalde',
        },
      }),
    ).rejects.toThrow(/shape_check/);
  });
});

describe('mentor-load (gerçek kapasite sayımı)', () => {
  it('yalnız kapasite harcayan durumlar ve bu takvim ayı sayılır', async () => {
    const mentor = await person('ALUMNI');
    const spec = (
      startsAt: Date,
      status: 'CONFIRMED' | 'REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'DECLINED',
    ) => ({
      mentorId: mentor,
      menteeId: undefined as unknown as string,
      startsAt,
      status,
    });
    const make = async (
      startsAt: Date,
      status: 'CONFIRMED' | 'REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'DECLINED',
    ) => {
      const s = spec(startsAt, status);
      await db.appointment.create({
        data: {
          mentorId: mentor,
          menteeId: await person(),
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          mode: 'ONLINE',
          status: s.status,
          expiresAt: new Date(startsAt.getTime() - 12 * HOUR),
          ...(status === 'CONFIRMED' ||
          status === 'DECLINED' ||
          status === 'COMPLETED' ||
          status === 'NO_SHOW'
            ? { decidedAt: NOW }
            : {}),
          ...(status === 'CANCELLED' ? { cancelledBySystem: true } : {}),
        },
      });
    };
    const day = (d: number, h = 7) => new Date(Date.UTC(2030, 5, d, h));
    await make(day(19, 7), 'CONFIRMED');
    await make(day(19, 8), 'COMPLETED');
    await make(day(19, 9), 'NO_SHOW');
    await make(day(20, 7), 'REQUESTED');
    await make(day(20, 8), 'CANCELLED');
    await make(day(20, 9), 'DECLINED');
    await make(new Date('2030-07-03T07:00:00Z'), 'CONFIRMED'); // başka ay
    await make(new Date('2030-06-30T20:30:00Z'), 'CONFIRMED'); // 30 Haziran 23:30 yerel → haziran
    await make(new Date('2030-06-30T21:30:00Z'), 'CONFIRMED'); // 1 Temmuz 00:30 yerel → temmuz
    const counts = await approvedCountsThisMonth(db, [mentor, randomUUID()], NOW);
    expect(counts.get(mentor)).toBe(4);
    expect((await approvedCountsThisMonth(db, [], NOW)).size).toBe(0);
  });
});

it('inceleyici: dolan geçerli slot 20 yarışta ve kazanan commitinden sonra hep SLOT_TAKEN döner', async () => {
  for (let round = 0; round < 20; round += 1) {
    const h = harness();
    const mentor = await mentorWith();
    const students = await Promise.all(Array.from({ length: 6 }, () => person()));
    const results = await Promise.allSettled(
      students.map((student) => ask(h, student, mentor, WED_10)),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
      `tur ${round + 1}`,
    ).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected')
        expect((result.reason as { code: string }).code).toBe('APPOINTMENT_SLOT_TAKEN');
    }
    // Zamanlamaya bağlı olmayan uç: doğrulama, kazananın commitinden KESİN sonra başlar.
    await expectCode(ask(h, await person(), mentor, WED_10), 'APPOINTMENT_SLOT_TAKEN');
    expect(await db.appointment.count({ where: { mentorId: mentor, status: 'REQUESTED' } })).toBe(
      1,
    );
  }
}, 60_000);
