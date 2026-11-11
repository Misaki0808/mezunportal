import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { createGoogleCalendar, googleEventId } from '../external/calendar/google';
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
  syncCalendarEvents,
} from './appointment-jobs';
import { createRecordingNotifier } from './appointment-notifier';

// Gerçek Google çağrısı YOK: Google REST'i taklit eden sahte fetch ile gerçek adaptör, gerçek randevu servisi ve gerçek veritabanı
// birlikte çalışır (kart 174: oluştur/sil, iptalde silme, hata yolunda randevu bozulmaz, bağlı değilken elle link, jeton loglanmaz).
const db = createTestPrisma();
afterAll(() => db.$disconnect());

const NOW = new Date('2030-06-17T06:00:00Z');
const NEXT_WED_10 = new Date('2030-06-26T07:00:00Z');
const REFRESH = '1//0gSECRET-yenileme';
const ACCESS = 'ya29.SECRET-erisim';
const MEET = 'https://meet.google.com/abc-defg-hij';
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

type Reply = Response | Error;
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const tokenOk = () => json(200, { access_token: ACCESS, expires_in: 3600 });
const eventOk = () =>
  json(200, { conferenceData: { entryPoints: [{ entryPointType: 'video', uri: MEET }] } });

function google(options: { connected?: boolean; replies: Reply[] }) {
  const calls: { url: string; method: string; body: string }[] = [];
  const queue = [...options.replies];
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? 'GET'),
      body: init.body ? String(init.body) : '',
    });
    const next = queue.shift();
    if (!next) throw new Error('beklenmeyen Google isteği: ' + String(url));
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  const rejected = vi.fn(async () => undefined);
  const calendar = createGoogleCalendar({
    clientId: 'kimlik',
    clientSecret: 'sir',
    loadRefreshToken: async () => (options.connected === false ? null : REFRESH),
    onTokenRejected: rejected,
    fetchImpl,
    sleep: async () => undefined,
  });
  return { calendar, calls, rejected };
}
const apiCalls = (g: ReturnType<typeof google>) =>
  g.calls.filter((c) => c.url.includes('googleapis.com/calendar'));

async function person(role: 'STUDENT' | 'ALUMNI', transferConsent = true) {
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId: inst.deptA1,
    role,
    ...(role === 'ALUMNI' ? { graduationYear: 2021 } : { entryYear: 2024 }),
  });
  if (transferConsent)
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
async function confirmed(g: ReturnType<typeof google>, menteeConsent = true) {
  const deps: AppointmentDeps = {
    db,
    now: () => NOW,
    calendar: g.calendar,
    notifier: createRecordingNotifier(),
  };
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
  const mentee = await person('STUDENT', menteeConsent);
  const view = await requestAppointment(deps, mentee, {
    mentorId: mentor,
    startsAt: NEXT_WED_10,
    mode: 'ONLINE',
  });
  await respondAppointment(deps, mentor, { decision: 'CONFIRM', appointmentId: view.id });
  return { deps, mentor, mentee, id: view.id };
}
const row = (id: string) => db.appointment.findUniqueOrThrow({ where: { id } });

describe('gerçek Google adaptörü + randevu akışı (sahte Google)', () => {
  it('onaylanan online randevuya Meet bağlantısı eklenir; davetliler mentor ve öğrenci; tekrar süpürmede çift etkinlik yok', async () => {
    const g = google({ replies: [tokenOk(), eventOk()] });
    const { deps, id, mentor, mentee } = await confirmed(g);
    expect(await syncCalendarEvents(deps, { ids: [id] })).toEqual({ created: 1, failed: 0 });
    const stored = await row(id);
    expect(stored.meetUrl).toBe(MEET);
    expect(stored.calendarEventId).toBe(googleEventId(`appointment:${id}`));
    const create = apiCalls(g)[0]!;
    expect(create.method).toBe('POST');
    expect(create.url).toContain('conferenceDataVersion=1');
    expect(create.url).toContain('sendUpdates=all');
    const body = JSON.parse(create.body) as {
      attendees: { email: string }[];
      start: { timeZone: string };
    };
    const emails = (
      await db.user.findMany({ where: { id: { in: [mentor, mentee] } }, select: { email: true } })
    ).map((u) => u.email);
    expect(body.attendees.map((a) => a.email).sort()).toEqual(emails.sort());
    expect(body.start.timeZone).toBe('Europe/Istanbul');
    expect(await syncCalendarEvents(deps, { ids: [id] })).toEqual({ created: 0, failed: 0 });
    expect(apiCalls(g)).toHaveLength(1);
  });

  it('iptal edilen randevunun Google etkinliği silinir (sendUpdates=all) ve kayıttan düşer; silinmiş etkinlik (404) sorun değildir', async () => {
    for (const status of [204, 404]) {
      const g = google({ replies: [tokenOk(), eventOk(), new Response(null, { status })] });
      const { deps, id, mentor } = await confirmed(g);
      await syncCalendarEvents(deps, { ids: [id] });
      await cancelAppointment(deps, mentor, { appointmentId: id });
      // iptal içindeki hızlı deneme silmiş olabilir; süpürme kalan varsa siler
      await deleteCancelledEvents(deps, { ids: [id] });
      const del = apiCalls(g).find((c) => c.method === 'DELETE');
      expect(del, String(status)).toBeDefined();
      expect(del!.url).toContain(googleEventId(`appointment:${id}`));
      expect(del!.url).toContain('sendUpdates=all');
      expect((await row(id)).calendarEventId).toBeNull();
    }
  });

  it('Google geçici düşerse randevu bozulmaz: onaylı kalır, link yok, sonraki süpürmede oluşur', async () => {
    const g = google({ replies: [tokenOk(), json(503), eventOk()] });
    const { deps, id } = await confirmed(g);
    expect(await syncCalendarEvents(deps, { ids: [id] })).toEqual({ created: 0, failed: 0 });
    expect(await row(id)).toMatchObject({
      status: 'CONFIRMED',
      meetUrl: null,
      calendarFailedAt: null,
      calendarAttempts: 1,
    });
    expect(await syncCalendarEvents(deps, { ids: [id] })).toEqual({ created: 1, failed: 0 });
    expect((await row(id)).meetUrl).toBe(MEET);
  });

  it('sürekli geçici hata: deneme hakkı bitince randevu onaylı kalır, mentor elle link ekler', async () => {
    const g = google({
      replies: [
        tokenOk(),
        ...Array(CALENDAR_MAX_ATTEMPTS)
          .fill(null)
          .map(() => json(500)),
      ],
    });
    const { deps, id, mentor } = await confirmed(g);
    let last = { created: 0, failed: 0 };
    for (let i = 0; i < CALENDAR_MAX_ATTEMPTS; i += 1)
      last = await syncCalendarEvents(deps, { ids: [id] });
    expect(last).toEqual({ created: 0, failed: 1 });
    expect(await row(id)).toMatchObject({ status: 'CONFIRMED', meetUrl: null });
    expect((await row(id)).calendarFailedAt).not.toBeNull();
    const link = await setMeetLink(deps, mentor, {
      appointmentId: id,
      url: 'https://meet.example.com/elle',
    });
    expect(link).toMatchObject({ status: 'CONFIRMED', meetUrl: 'https://meet.example.com/elle' });
  });

  it('Google bağlı değilken (jeton yok): Google çağrılmaz, tek denemede elle link aşamasına geçilir, randevu bozulmaz', async () => {
    const g = google({ connected: false, replies: [] });
    const { deps, id, mentor } = await confirmed(g);
    expect(await syncCalendarEvents(deps, { ids: [id] })).toEqual({ created: 0, failed: 1 });
    expect(g.calls).toHaveLength(0);
    expect(await row(id)).toMatchObject({ status: 'CONFIRMED', meetUrl: null });
    expect((await row(id)).calendarFailedAt).not.toBeNull();
    const link = await setMeetLink(deps, mentor, {
      appointmentId: id,
      url: 'https://meet.example.com/elle',
    });
    expect(link.meetUrl).toBe('https://meet.example.com/elle');
  });

  it('yetki geri alınmış (invalid_grant): bağlantı işaretlenir, yeniden denenmez, randevu elle linke düşer', async () => {
    const g = google({ replies: [json(400, { error: 'invalid_grant' })] });
    const { deps, id } = await confirmed(g);
    expect(await syncCalendarEvents(deps, { ids: [id] })).toEqual({ created: 0, failed: 1 });
    expect(g.rejected).toHaveBeenCalledTimes(1);
    expect(await row(id)).toMatchObject({ status: 'CONFIRMED', meetUrl: null });
  });

  it('kalıcı red (403) anında vazgeçer; yurt dışı aktarım rızası olmayanda Google hiç çağrılmaz', async () => {
    const rejected = google({ replies: [tokenOk(), json(403)] });
    const a = await confirmed(rejected);
    expect(await syncCalendarEvents(a.deps, { ids: [a.id] })).toEqual({ created: 0, failed: 1 });
    const noConsent = google({ replies: [] });
    const b = await confirmed(noConsent, false);
    expect(await syncCalendarEvents(b.deps, { ids: [b.id] })).toEqual({ created: 0, failed: 1 });
    expect(noConsent.calls).toHaveLength(0);
  });

  it('akış boyunca log ve randevu kaydı jeton taşımaz', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const g = google({ replies: [tokenOk(), eventOk()] });
    const { deps, id } = await confirmed(g);
    await syncCalendarEvents(deps, { ids: [id] });
    const dump = JSON.stringify(spies.map((s) => s.mock.calls)) + JSON.stringify(await row(id));
    for (const secret of [REFRESH, ACCESS]) expect(dump, secret).not.toContain(secret);
    for (const spy of spies) spy.mockRestore();
  });
});
