import { describe, expect, it } from 'vitest';

import { saveAvailabilitySchema } from '../src/contracts/appointment';
import { SEED_MENTOR_AVAILABILITY, TEST_PERSONAS } from './seed-data';

describe('seed mentor müsaitliği (kart 353)', () => {
  it('sözleşmeye uyar: çakışma yok, 5 dakika katları, geçerli gün ve saat', () => {
    const parsed = saveAvailabilitySchema.safeParse({ rules: SEED_MENTOR_AVAILABILITY });
    expect(parsed.success).toBe(true);
  });

  it('hafta içi (pazartesi–cuma) iki mesai aralığıdır: 10:00–12:00 ve 14:00–16:00', () => {
    expect([...new Set(SEED_MENTOR_AVAILABILITY.map((rule) => rule.weekday))]).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const weekday of [1, 2, 3, 4, 5]) {
      expect(SEED_MENTOR_AVAILABILITY.filter((rule) => rule.weekday === weekday)).toEqual([
        { weekday, startMinute: 600, endMinute: 720 },
        { weekday, startMinute: 840, endMinute: 960 },
      ]);
    }
  });

  it('kurallar haftalıktır (tarih yok): seed ne zaman koşarsa koşsun gelecekte slot üretir', () => {
    for (const rule of SEED_MENTOR_AVAILABILITY) {
      expect(Object.keys(rule).sort()).toEqual(['endMinute', 'startMinute', 'weekday']);
    }
  });

  it('her mentor personasının görüşme süresi aralığa en az bir kez sığar (aralık boş slot üretmez diye boş kalmaz)', () => {
    const mentors = Object.values(TEST_PERSONAS).filter((persona) => 'mentor' in persona);
    expect(mentors.length).toBeGreaterThanOrEqual(2);
    for (const persona of mentors) {
      const { sessionMinutes } = (persona as { mentor: { sessionMinutes: number } }).mentor;
      for (const rule of SEED_MENTOR_AVAILABILITY) {
        expect(rule.endMinute - rule.startMinute).toBeGreaterThanOrEqual(sessionMinutes);
      }
    }
  });
});
