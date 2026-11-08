import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';

import {
  APPOINTMENT_ACTION_ERRORS,
  appointmentIcsHref,
  appointmentViewSchema,
  cancelAppointmentSchema,
  listMyAppointmentsSchema,
  requestAppointmentSchema,
  respondAppointmentSchema,
  saveAvailabilitySchema,
  saveMentorSettingsSchema,
  setMeetLinkSchema,
  setPauseSchema,
  slotListSchema,
} from './appointment';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('mentor ayarları', () => {
  const base = { monthlyCapacity: 4, sessionMinutes: 30, meetingModes: ['ONLINE'], isActive: true };
  it('kapasite 1–40, süre 15/20/30', () => {
    expect(ok(saveMentorSettingsSchema, base)).toBe(true);
    expect(ok(saveMentorSettingsSchema, { ...base, monthlyCapacity: 0 })).toBe(false);
    expect(ok(saveMentorSettingsSchema, { ...base, monthlyCapacity: 41 })).toBe(false);
    for (const minutes of [15, 20, 30])
      expect(ok(saveMentorSettingsSchema, { ...base, sessionMinutes: minutes })).toBe(true);
    for (const minutes of [10, 25, 45, '30'])
      expect(ok(saveMentorSettingsSchema, { ...base, sessionMinutes: minutes })).toBe(false);
  });
  it('yüz yüze sunuluyorsa yer notu zorunlu; biçimler tekrarsız ve boş değil', () => {
    expect(ok(saveMentorSettingsSchema, { ...base, meetingModes: ['IN_PERSON'] })).toBe(false);
    expect(
      ok(saveMentorSettingsSchema, {
        ...base,
        meetingModes: ['IN_PERSON'],
        inPersonNote: 'Bina A, kat 2',
      }),
    ).toBe(true);
    expect(ok(saveMentorSettingsSchema, { ...base, meetingModes: [] })).toBe(false);
    expect(ok(saveMentorSettingsSchema, { ...base, meetingModes: ['ONLINE', 'ONLINE'] })).toBe(
      false,
    );
    expect(ok(saveMentorSettingsSchema, { ...base, userId: 'baska' })).toBe(false);
  });
});

describe('haftalık müsaitlik', () => {
  const rule = (weekday: number, startMinute: number, endMinute: number) => ({
    weekday,
    startMinute,
    endMinute,
  });
  it('gün 1–7, dakika 5’in katı, bitiş başlangıçtan sonra', () => {
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 540, 720)] })).toBe(true);
    expect(ok(saveAvailabilitySchema, { rules: [rule(0, 540, 720)] })).toBe(false);
    expect(ok(saveAvailabilitySchema, { rules: [rule(8, 540, 720)] })).toBe(false);
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 541, 720)] })).toBe(false);
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 720, 720)] })).toBe(false);
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 720, 600)] })).toBe(false);
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 0, 1441)] })).toBe(false);
  });
  it('aynı günde çakışma reddedilir, bitişik aralık ve farklı gün serbest', () => {
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 540, 720), rule(1, 600, 800)] })).toBe(
      false,
    );
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 540, 720), rule(1, 720, 800)] })).toBe(
      true,
    );
    expect(ok(saveAvailabilitySchema, { rules: [rule(1, 540, 720), rule(2, 600, 800)] })).toBe(
      true,
    );
    expect(ok(saveAvailabilitySchema, { rules: [] })).toBe(true);
    expect(
      ok(saveAvailabilitySchema, {
        rules: Array.from({ length: 29 }, (_, i) => rule((i % 7) + 1, i * 5, i * 5 + 5)),
      }),
    ).toBe(false);
  });
});

describe('talep ve yanıt', () => {
  it('talep: slot zamanı, biçim ve en çok 500 karakter not; kimlik/rol alanı yok', () => {
    const base = { mentorId: 'm1', startsAt: '2030-01-01T10:00:00Z', mode: 'ONLINE' };
    expect(ok(requestAppointmentSchema, base)).toBe(true);
    expect(ok(requestAppointmentSchema, { ...base, note: 'x'.repeat(501) })).toBe(false);
    expect(ok(requestAppointmentSchema, { ...base, mode: 'PHONE' })).toBe(false);
    expect(ok(requestAppointmentSchema, { ...base, startsAt: 'dün' })).toBe(false);
    expect(ok(requestAppointmentSchema, { ...base, menteeId: 'baska' })).toBe(false);
  });
  it('yanıt: onay gerekçesiz, ret gerekçe alabilir; iptal gerekçesi 3+ karakter', () => {
    expect(ok(respondAppointmentSchema, { decision: 'CONFIRM', appointmentId: 'a' })).toBe(true);
    expect(
      ok(respondAppointmentSchema, {
        decision: 'DECLINE',
        appointmentId: 'a',
        reason: 'Müsait değilim',
      }),
    ).toBe(true);
    expect(
      ok(respondAppointmentSchema, { decision: 'CONFIRM', appointmentId: 'a', reason: 'x' }),
    ).toBe(false);
    expect(ok(respondAppointmentSchema, { decision: 'MAYBE', appointmentId: 'a' })).toBe(false);
    expect(ok(cancelAppointmentSchema, { appointmentId: 'a', reason: 'ab' })).toBe(false);
    expect(ok(cancelAppointmentSchema, { appointmentId: 'a' })).toBe(true);
  });
  it('görüşme bağlantısı yalnız https ve geçerli alan adı', () => {
    expect(ok(setMeetLinkSchema, { appointmentId: 'a', url: 'https://meet.example.com/abc' })).toBe(
      true,
    );
    for (const url of [
      'http://meet.example.com/a',
      'javascript:alert(1)',
      'https://kullanici:parola@example.com/',
      'https://localhost/a',
      'abc',
      'https://' + 'x'.repeat(300) + '.com',
    ]) {
      expect(ok(setMeetLinkSchema, { appointmentId: 'a', url }), url).toBe(false);
    }
    expect(setMeetLinkSchema.safeParse({ appointmentId: 'a', url: 'http://x.com' })).toMatchObject({
      success: false,
    });
  });
  it('müsait değilim: tarih ya da null', () => {
    expect(ok(setPauseSchema, { pausedUntil: null })).toBe(true);
    expect(ok(setPauseSchema, { pausedUntil: '2030-01-01T00:00:00Z' })).toBe(true);
    expect(ok(setPauseSchema, { pausedUntil: 'yarın' })).toBe(false);
  });
});

describe('çıktı şemaları ve yardımcılar', () => {
  it('liste girdisi varsayılanlar ve sınırlar', () => {
    expect(listMyAppointmentsSchema.parse({ role: 'MENTOR' }).limit).toBe(20);
    expect(ok(listMyAppointmentsSchema, { role: 'ADMIN' })).toBe(false);
    expect(ok(listMyAppointmentsSchema, { role: 'MENTEE', limit: 51 })).toBe(false);
    expect(ok(listMyAppointmentsSchema, { role: 'MENTEE', statuses: [] })).toBe(false);
  });
  it('slot listesi e-posta paylaşımı bildirimini taşır; randevu görünümü ek alan kabul etmez', () => {
    const list = {
      mentor: { userId: 'm', displayName: 'Ayşe', sessionMinutes: 30, inPersonNote: null },
      slots: [],
      unavailableReason: null,
      emailShared: true,
    };
    expect(ok(slotListSchema, list)).toBe(true);
    expect(ok(slotListSchema, { ...list, emailShared: false })).toBe(false);
    const view = {
      id: 'a',
      status: 'REQUESTED',
      role: 'MENTEE',
      counterpart: { userId: 'm', displayName: 'Ayşe' },
      startsAt: new Date(),
      endsAt: new Date(),
      mode: 'ONLINE',
      note: null,
      location: null,
      meetUrl: null,
      linkNeeded: false,
      expiresAt: null,
      decidedAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date(),
      actions: {
        canConfirm: false,
        confirmBlockedReason: null,
        canDecline: false,
        canCancel: true,
        canSetLink: false,
        canDownloadIcs: false,
      },
    };
    expect(ok(appointmentViewSchema, view)).toBe(true);
    expect(ok(appointmentViewSchema, { ...view, counterpartEmail: 'a@b.co' })).toBe(false);
  });
  it('.ics bağlantısı kimliği kaçırır; hata kodları kayıtlı', () => {
    expect(appointmentIcsHref('a/b c')).toBe('/api/randevu/a%2Fb%20c/ics');
    for (const codes of Object.values(APPOINTMENT_ACTION_ERRORS)) {
      for (const code of codes) expect(ERROR_CODES).toContain(code);
    }
  });
});
