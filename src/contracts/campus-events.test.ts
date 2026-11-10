import { describe, expect, it } from 'vitest';
import { checkInCampusEventSchema, createCampusEventSchema } from './campus-events';

const event = {
  title: 'Kariyer buluşması',
  description: 'Mezunlarla kariyer buluşması',
  location: 'Kampüs',
  startsAt: '2026-11-15T10:00:00+03:00',
  endsAt: '2026-11-15T12:00:00+03:00',
  capacity: 50,
  departmentIds: ['dept-a'],
};
describe('etkinlik sözleşmesi', () => {
  it('geçerli etkinliği kabul eder ve ters zamanı, tekrarlı bölümü, boş kontenjanı reddeder', () => {
    expect(createCampusEventSchema.safeParse(event).success).toBe(true);
    expect(createCampusEventSchema.safeParse({ ...event, endsAt: event.startsAt }).success).toBe(
      false,
    );
    expect(
      createCampusEventSchema.safeParse({ ...event, departmentIds: ['dept-a', 'dept-a'] }).success,
    ).toBe(false);
    expect(createCampusEventSchema.safeParse({ ...event, capacity: 0 }).success).toBe(false);
  });
  it('kodu baştaki sıfırlarıyla tam altı rakam olarak alır', () => {
    expect(checkInCampusEventSchema.safeParse({ eventId: 'e', code: '001234' }).success).toBe(true);
    expect(checkInCampusEventSchema.safeParse({ eventId: 'e', code: '12345' }).success).toBe(false);
    expect(checkInCampusEventSchema.safeParse({ eventId: 'e', code: 123456 }).success).toBe(false);
  });
});
