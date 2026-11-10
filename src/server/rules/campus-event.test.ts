import { describe, expect, it } from 'vitest';
import { campusEventCode, eventAttendanceMultiplier, validCampusEventCode } from './campus-event';

describe('etkinlik katılımı', () => {
  it('kod etkinliğe ve 120 saniyelik pencereye bağlıdır', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    const first = campusEventCode('a', 'secret', now);
    const input = {
      eventId: 'a',
      secret: 'secret',
      code: first.code,
      now,
      startsAt: now,
      endsAt: new Date(now.getTime() + 600_000),
    };
    expect(validCampusEventCode(input)).toBe(true);
    expect(validCampusEventCode({ ...input, eventId: 'b' })).toBe(false);
    expect(validCampusEventCode({ ...input, now: first.expiresAt })).toBe(false);
    expect(validCampusEventCode({ ...input, now: new Date(now.getTime() - 1) })).toBe(false);
    expect(validCampusEventCode({ ...input, now: input.endsAt })).toBe(false);
    expect(validCampusEventCode({ ...input, startsAt: new Date(now.getTime() + 1) })).toBe(false);
    expect(validCampusEventCode({ ...input, endsAt: now })).toBe(false);
  });
  it('beşinci katılımda aylık puan çarpanını sıfırlar', () => {
    expect(eventAttendanceMultiplier(3)).toBe(100);
    expect(eventAttendanceMultiplier(4)).toBe(0);
  });
});
