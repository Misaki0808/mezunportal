import { describe, expect, it } from 'vitest';

import type { AvailabilityRule } from '@/contracts/appointment';
import { APPOINTMENT_STATUSES } from '@/contracts/appointment';

import {
  canTransition,
  computeExpiresAt,
  hasCapacity,
  isCancellable,
  isExpired,
  needsImmediateReminder,
  reminderDueAt,
} from './appointmentLifecycle';
import { findSlot, generateSlots, monthKey, monthRange } from './appointmentSlots';
import { buildIcs, foldLine } from './ics';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 2030-06-17 pazartesi 09:00 İstanbul = 06:00Z
const NOW = new Date('2030-06-17T06:00:00Z');
const rule = (
  weekday: number,
  startMinute: number,
  endMinute: number,
  mode: AvailabilityRule['mode'] = null,
): AvailabilityRule => ({
  weekday,
  startMinute,
  endMinute,
  mode,
});
const slots = (over: Partial<Parameters<typeof generateSlots>[0]> = {}) =>
  generateSlots({
    rules: [rule(3, 600, 720)],
    sessionMinutes: 30,
    meetingModes: ['ONLINE'],
    now: NOW,
    ...over,
  });

describe('monthKey / monthRange (İstanbul ayı)', () => {
  it('ay sınırı UTC+3’e göre', () => {
    expect(monthKey(new Date('2030-06-30T20:59:59Z'))).toBe('2030-06');
    expect(monthKey(new Date('2030-06-30T21:00:00Z'))).toBe('2030-07');
    expect(monthKey(new Date('2030-12-31T21:00:00Z'))).toBe('2031-01');
    const range = monthRange(new Date('2030-06-15T12:00:00Z'));
    expect(range.from.toISOString()).toBe('2030-05-31T21:00:00.000Z');
    expect(range.to.toISOString()).toBe('2030-06-30T21:00:00.000Z');
  });
});

describe('generateSlots', () => {
  it('çarşamba 10:00–12:00, 30 dk: dört slot, yerel saat UTC+3’e çevrilir', () => {
    const list = slots();
    // en az 24 saat sonra: 2030-06-19 (çarşamba) 10:00 yerel = 07:00Z
    expect(list.slice(0, 4).map((slot) => slot.startsAt.toISOString())).toEqual([
      '2030-06-19T07:00:00.000Z',
      '2030-06-19T07:30:00.000Z',
      '2030-06-19T08:00:00.000Z',
      '2030-06-19T08:30:00.000Z',
    ]);
    expect(list[0]!.endsAt.toISOString()).toBe('2030-06-19T07:30:00.000Z');
  });

  it('süre pencereye sığmazsa artık slot yok; süre adımı kadar ilerler', () => {
    expect(
      slots({ rules: [rule(3, 600, 645)], sessionMinutes: 20 }).filter((s) =>
        s.startsAt.toISOString().startsWith('2030-06-19'),
      ),
    ).toHaveLength(2);
    expect(slots({ rules: [rule(3, 600, 610)], sessionMinutes: 15 })).toEqual([]);
  });

  it('en az 24 saat sonrası ve 21 gün ufku', () => {
    const exactly24 = generateSlots({
      rules: [rule(2, 9 * 60, 9 * 60 + 30)],
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      now: NOW,
    });
    // salı 09:00 yerel = tam 24 saat sonra → dahil
    expect(exactly24[0]!.startsAt.toISOString()).toBe('2030-06-18T06:00:00.000Z');
    const justBefore = generateSlots({
      rules: [rule(2, 9 * 60, 9 * 60 + 30)],
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      now: new Date(NOW.getTime() + 1),
    });
    expect(justBefore[0]!.startsAt.toISOString()).toBe('2030-06-25T06:00:00.000Z');
    const all = slots({
      rules: [
        rule(1, 0, 1440),
        rule(2, 0, 1440),
        rule(3, 0, 1440),
        rule(4, 0, 1440),
        rule(5, 0, 1440),
        rule(6, 0, 1440),
        rule(7, 0, 1440),
      ],
      sessionMinutes: 30,
    });
    expect(all.every((slot) => slot.startsAt.getTime() < NOW.getTime() + 21 * DAY)).toBe(true);
    expect(all.every((slot) => slot.startsAt.getTime() >= NOW.getTime() + DAY)).toBe(true);
    expect(all.at(-1)!.startsAt.getTime()).toBe(NOW.getTime() + 21 * DAY - 30 * 60_000);
  });

  it('dolu aralıkla kesişen slot çıkar, bitişik slot kalır', () => {
    const base = slots();
    const busy = [
      { startsAt: new Date('2030-06-19T07:30:00Z'), endsAt: new Date('2030-06-19T08:00:00Z') },
    ];
    const list = slots({ busy });
    expect(list.map((s) => s.startsAt.toISOString())).not.toContain('2030-06-19T07:30:00.000Z');
    expect(list.map((s) => s.startsAt.toISOString())).toContain('2030-06-19T07:00:00.000Z');
    expect(list.map((s) => s.startsAt.toISOString())).toContain('2030-06-19T08:00:00.000Z');
    expect(list.length).toBe(base.length - 1);
    // Yarım kesişen uzun aralık iki slotu birden eler.
    const wide = slots({
      busy: [
        { startsAt: new Date('2030-06-19T07:15:00Z'), endsAt: new Date('2030-06-19T07:45:00Z') },
      ],
    });
    expect(wide.length).toBe(base.length - 2);
  });

  it('“müsait değilim” tarihinden önceki slotlar çıkar, tam tarihteki kalır', () => {
    const list = slots({ pausedUntil: new Date('2030-06-26T07:00:00Z') });
    expect(list[0]!.startsAt.toISOString()).toBe('2030-06-26T07:00:00.000Z');
  });

  it('kapasitesi dolu ay slot vermez', () => {
    const none = slots({ fullMonths: new Set(['2030-06', '2030-07']) });
    expect(none).toEqual([]);
    const julyOnly = slots({ fullMonths: new Set(['2030-06']) });
    expect(julyOnly.every((s) => monthKey(s.startsAt) === '2030-07')).toBe(true);
  });

  it('biçim: kural biçimi mentorun sunduğuyla kesişir; kesişmiyorsa slot yok', () => {
    expect(slots({ rules: [rule(3, 600, 720, 'IN_PERSON')], meetingModes: ['ONLINE'] })).toEqual(
      [],
    );
    expect(
      slots({ rules: [rule(3, 600, 720, 'ONLINE')], meetingModes: ['ONLINE', 'IN_PERSON'] })[0]!
        .modes,
    ).toEqual(['ONLINE']);
    expect(
      slots({ rules: [rule(3, 600, 720)], meetingModes: ['ONLINE', 'IN_PERSON'] })[0]!.modes,
    ).toEqual(['ONLINE', 'IN_PERSON']);
  });

  it('gece yarısı geçişi: pazar 23:30 yerel = pazar 20:30Z; ay sonu doğru güne düşer', () => {
    const list = generateSlots({
      rules: [rule(7, 23 * 60 + 30, 24 * 60)],
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      now: new Date('2030-06-20T00:00:00Z'),
    });
    expect(list[0]!.startsAt.toISOString()).toBe('2030-06-23T20:30:00.000Z');
    expect(list[0]!.endsAt.toISOString()).toBe('2030-06-23T21:00:00.000Z');
    expect(monthKey(list[0]!.startsAt)).toBe('2030-06');
  });

  it('kural yoksa boş; sıra zamana göre; findSlot yalnız üretilen slotu ve sunulan biçimi bulur', () => {
    expect(slots({ rules: [] })).toEqual([]);
    const list = slots({ rules: [rule(5, 600, 660), rule(3, 600, 660)] });
    expect(list.map((s) => s.startsAt.getTime())).toEqual(
      [...list.map((s) => s.startsAt.getTime())].sort((a, b) => a - b),
    );
    const first = list[0]!;
    expect(findSlot(list, first.startsAt, 'ONLINE')).toBe(first);
    expect(findSlot(list, first.startsAt, 'IN_PERSON')).toBeNull();
    expect(findSlot(list, new Date(first.startsAt.getTime() + 60_000), 'ONLINE')).toBeNull();
  });
});

describe('durum makinesi', () => {
  it('izinli geçişler ve aktörler', () => {
    expect(canTransition('REQUESTED', 'CONFIRMED', 'MENTOR')).toBe(true);
    expect(canTransition('REQUESTED', 'CONFIRMED', 'MENTEE')).toBe(false);
    expect(canTransition('REQUESTED', 'DECLINED', 'MENTOR')).toBe(true);
    expect(canTransition('REQUESTED', 'CANCELLED', 'MENTEE')).toBe(true);
    expect(canTransition('REQUESTED', 'CANCELLED', 'MENTOR')).toBe(false);
    expect(canTransition('REQUESTED', 'EXPIRED', 'SYSTEM')).toBe(true);
    expect(canTransition('REQUESTED', 'EXPIRED', 'MENTOR')).toBe(false);
    expect(canTransition('CONFIRMED', 'CANCELLED', 'MENTOR')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED', 'MENTEE')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED', 'SYSTEM')).toBe(false);
  });
  it('sonlanmış durumlardan çıkış yok', () => {
    for (const from of ['DECLINED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'] as const) {
      for (const to of APPOINTMENT_STATUSES) {
        for (const actor of ['MENTOR', 'MENTEE', 'SYSTEM'] as const) {
          expect(canTransition(from, to, actor), `${from}→${to} ${actor}`).toBe(false);
        }
      }
    }
    expect(canTransition('CONFIRMED', 'CONFIRMED', 'MENTOR')).toBe(false);
    expect(canTransition('CONFIRMED', 'DECLINED', 'MENTOR')).toBe(false);
  });
});

describe('zaman kuralları', () => {
  const start = (hoursFromRequest: number, requestedAt: Date) =>
    new Date(requestedAt.getTime() + hoursFromRequest * HOUR);
  it('D11: 72 saat ya da başlangıçtan 12 saat önce, hangisi erkense', () => {
    const requested = new Date('2030-06-17T06:00:00Z');
    expect(computeExpiresAt(requested, start(200, requested)).getTime()).toBe(
      requested.getTime() + 72 * HOUR,
    );
    expect(computeExpiresAt(requested, start(50, requested)).getTime()).toBe(
      requested.getTime() + 38 * HOUR,
    );
    expect(computeExpiresAt(requested, start(84, requested)).getTime()).toBe(
      requested.getTime() + 72 * HOUR,
    ); // eşit
    expect(computeExpiresAt(requested, start(83, requested)).getTime()).toBe(
      requested.getTime() + 71 * HOUR,
    );
    expect(computeExpiresAt(requested, start(85, requested)).getTime()).toBe(
      requested.getTime() + 72 * HOUR,
    );
  });
  it('süre tam dolduğunda dolmuştur', () => {
    const at = new Date('2030-06-17T06:00:00Z');
    expect(isExpired(at, at)).toBe(true);
    expect(isExpired(at, new Date(at.getTime() - 1))).toBe(false);
  });
  it('iptal: talep her zaman, onaylı yalnız başlamadan önce', () => {
    const now = new Date('2030-06-17T06:00:00Z');
    expect(isCancellable('REQUESTED', new Date(now.getTime() - HOUR), now)).toBe(true);
    expect(isCancellable('CONFIRMED', new Date(now.getTime() + 1), now)).toBe(true);
    expect(isCancellable('CONFIRMED', now, now)).toBe(false);
    for (const status of ['DECLINED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'] as const) {
      expect(isCancellable(status, new Date(now.getTime() + DAY), now)).toBe(false);
    }
  });
  it('hatırlatma 24 saat önce; onay o noktadan sonra geldiyse onayla birlikte', () => {
    const startsAt = new Date('2030-06-20T10:00:00Z');
    expect(reminderDueAt(startsAt).toISOString()).toBe('2030-06-19T10:00:00.000Z');
    expect(needsImmediateReminder(new Date('2030-06-19T09:59:59Z'), startsAt)).toBe(false);
    expect(needsImmediateReminder(new Date('2030-06-19T10:00:00Z'), startsAt)).toBe(true);
    expect(needsImmediateReminder(new Date('2030-06-20T01:00:00Z'), startsAt)).toBe(true);
  });
  it('kapasite: sayı kapasiteden azsa uygun', () => {
    expect(hasCapacity(3, 4)).toBe(true);
    expect(hasCapacity(4, 4)).toBe(false);
    expect(hasCapacity(0, 0)).toBe(false);
  });
});

describe('.ics', () => {
  const ics = (over: Partial<Parameters<typeof buildIcs>[0]> = {}) =>
    buildIcs({
      uid: 'a-1',
      startsAt: new Date('2030-06-19T07:00:00Z'),
      endsAt: new Date('2030-06-19T07:30:00Z'),
      summary: 'MezunPortal görüşmesi',
      now: new Date('2030-06-17T06:00:00Z'),
      ...over,
    });
  it('zorunlu alanlar, UTC zamanlar, CRLF', () => {
    const text = ics();
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTART:20300619T070000Z\r\n');
    expect(text).toContain('DTEND:20300619T073000Z\r\n');
    expect(text).toContain('UID:a-1@mezunportal\r\n');
    expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
  it('metin kaçışı ve satır enjeksiyonu engeli', () => {
    const text = ics({
      summary: 'A;B,C\\D\nSONRAKI',
      description: 'x\r\nEND:VEVENT',
      location: 'Bina; kat 2',
      url: 'https://x.com/a\r\nBEGIN:VEVENT',
    });
    expect(text).toContain('SUMMARY:A\\;B\\,C\\\\D\\nSONRAKI');
    expect(text.split('\r\n').filter((line) => line === 'END:VEVENT')).toHaveLength(1);
    expect(text.split('\r\n').filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(text).toContain('LOCATION:Bina\\; kat 2');
  });
  it('inceleyici: tek CR de satır enjeksiyonuna dönüşmeden kaçırılır', () => {
    const text = ics({ description: 'x\rEND:VEVENT\rBEGIN:VEVENT' });
    expect(text.replaceAll('\r\n', '')).not.toContain('\r');
    expect(text).toContain('DESCRIPTION:x\\nEND:VEVENT\\nBEGIN:VEVENT');
  });
  it('75 oktetten uzun satır katlanır, çok baytlı karakter bölünmez', () => {
    const folded = foldLine('SUMMARY:' + 'ğ'.repeat(80));
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.map((line, i) => (i === 0 ? line : line.slice(1))).join('')).toBe(
      'SUMMARY:' + 'ğ'.repeat(80),
    );
  });
  it('katılımcı e-postası yazılmaz', () => {
    expect(ics({ description: 'Mentor görüşmesi' })).not.toMatch(/@(?!mezunportal)/);
  });
});
