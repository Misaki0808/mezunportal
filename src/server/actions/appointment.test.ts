import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireVerifiedMember: vi.fn(),
  service: {
    getMyMentorSettings: vi.fn(),
    saveMentorSettings: vi.fn(),
    saveAvailability: vi.fn(),
    setPause: vi.fn(),
    listSlots: vi.fn(),
    requestAppointment: vi.fn(),
    respondAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    setMeetLink: vi.fn(),
    listMyAppointments: vi.fn(),
    getAppointment: vi.fn(),
  },
}));
vi.mock('../permissions', () => ({ requireVerifiedMember: mocks.requireVerifiedMember }));
vi.mock('./deps', () => ({ appointmentDeps: () => ({ marker: 'deps' }) }));
vi.mock('../services/appointment', () => mocks.service);

import * as actions from './appointment';

beforeEach(() => {
  mocks.requireVerifiedMember
    .mockReset()
    .mockResolvedValue({ userId: 'oturum-kullanicisi', facts: {} });
  for (const fn of Object.values(mocks.service)) fn.mockReset();
});

const calls: [string, () => Promise<unknown>, keyof typeof mocks.service, unknown?][] = [
  ['getMyMentorSettings', () => actions.getMyMentorSettings(), 'getMyMentorSettings'],
  [
    'saveMentorSettings',
    () =>
      actions.saveMentorSettings({
        monthlyCapacity: 4,
        sessionMinutes: 30,
        meetingModes: ['ONLINE'],
        isActive: true,
      }),
    'saveMentorSettings',
  ],
  [
    'saveAvailability',
    () => actions.saveAvailability({ rules: [{ weekday: 3, startMinute: 600, endMinute: 720 }] }),
    'saveAvailability',
  ],
  ['setPause', () => actions.setPause({ pausedUntil: null }), 'setPause'],
  ['listSlots', () => actions.listSlots({ mentorId: 'm' }), 'listSlots'],
  [
    'requestAppointment',
    () =>
      actions.requestAppointment({
        mentorId: 'm',
        startsAt: '2030-06-19T07:00:00Z' as never,
        mode: 'ONLINE',
      }),
    'requestAppointment',
  ],
  [
    'respondAppointment',
    () => actions.respondAppointment({ decision: 'CONFIRM', appointmentId: 'a' }),
    'respondAppointment',
  ],
  [
    'cancelAppointment',
    () => actions.cancelAppointment({ appointmentId: 'a' }),
    'cancelAppointment',
  ],
  [
    'setMeetLink',
    () => actions.setMeetLink({ appointmentId: 'a', url: 'https://meet.example.com/x' }),
    'setMeetLink',
  ],
  [
    'listMyAppointments',
    () => actions.listMyAppointments({ role: 'MENTOR' }),
    'listMyAppointments',
  ],
  ['getAppointment', () => actions.getAppointment({ appointmentId: 'a' }), 'getAppointment'],
];

describe('randevu eylemleri', () => {
  it('bütün dışa açık eylemler kapsanır', () => {
    expect(calls.map(([name]) => name).sort()).toEqual(Object.keys(actions).sort());
  });

  it.each(calls)('%s: oturumsuz/yetkisizde servis çağrılmaz', async (_name, call, service) => {
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedForbidden('AUTH_NOT_VERIFIED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_NOT_VERIFIED' });
    expect(mocks.service[service]).not.toHaveBeenCalled();
  });

  it.each(calls)('%s: kimlik oturumdan gelir ve servis çağrılır', async (_name, call, service) => {
    mocks.service[service].mockResolvedValue({ ok: 1 });
    expect(await call()).toEqual({ ok: true, data: { ok: 1 } });
    const args = mocks.service[service].mock.calls[0]!;
    expect(args[0]).toEqual({ marker: 'deps' });
    expect(args[1]).toBe('oturum-kullanicisi');
  });

  it('servis hatası kodlu döner; beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.service.respondAppointment.mockRejectedValueOnce(Object.assign(new Error('x'), {}));
    expect(await actions.respondAppointment({ decision: 'CONFIRM', appointmentId: 'a' })).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });

  it('geçersiz girdi servise ulaşmaz; kimlik/rol alanları reddedilir', async () => {
    for (const result of [
      await actions.saveMentorSettings({
        monthlyCapacity: 0,
        sessionMinutes: 30,
        meetingModes: ['ONLINE'],
        isActive: true,
      }),
      await actions.saveMentorSettings({
        monthlyCapacity: 4,
        sessionMinutes: 45 as never,
        meetingModes: ['ONLINE'],
        isActive: true,
      }),
      await actions.saveAvailability({
        rules: [
          { weekday: 1, startMinute: 600, endMinute: 700 },
          { weekday: 1, startMinute: 650, endMinute: 800 },
        ],
      }),
      await actions.requestAppointment({ mentorId: 'm', startsAt: 'dün' as never, mode: 'ONLINE' }),
      await actions.requestAppointment({
        mentorId: 'm',
        startsAt: '2030-06-19T07:00:00Z' as never,
        mode: 'ONLINE',
        menteeId: 'baska',
      } as never),
      await actions.respondAppointment({ decision: 'MAYBE', appointmentId: 'a' } as never),
      await actions.setMeetLink({ appointmentId: 'a', url: 'http://x.com' }),
      await actions.listMyAppointments({ role: 'ADMIN' } as never),
      await actions.getAppointment({ appointmentId: '' }),
    ]) {
      expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    }
    for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
  });

  it('doğrulanmış girdi (varsayılanlarla) servise gider', async () => {
    mocks.service.requestAppointment.mockResolvedValue({});
    await actions.requestAppointment({
      mentorId: ' m ',
      startsAt: '2030-06-19T07:00:00Z' as never,
      mode: 'ONLINE',
      note: ' selam ',
    });
    expect(mocks.service.requestAppointment.mock.calls[0]![2]).toEqual({
      mentorId: 'm',
      startsAt: new Date('2030-06-19T07:00:00Z'),
      mode: 'ONLINE',
      note: 'selam',
    });
    mocks.service.listMyAppointments.mockResolvedValue({});
    await actions.listMyAppointments({ role: 'MENTEE' });
    expect(mocks.service.listMyAppointments.mock.calls[0]![2]).toEqual({
      role: 'MENTEE',
      limit: 20,
    });
  });
});
