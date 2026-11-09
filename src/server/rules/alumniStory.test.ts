import { expect, it } from 'vitest';
import { istanbulMonth } from './alumniStory';
it('ay, İstanbul gece yarısında döner; yıl geçişini de kapsar', () => {
  expect(istanbulMonth(new Date('2026-04-30T20:59:59.999Z'))).toBe('2026-04');
  expect(istanbulMonth(new Date('2026-04-30T21:00:00.000Z'))).toBe('2026-05');
  expect(istanbulMonth(new Date('2026-12-31T21:00:00.000Z'))).toBe('2027-01');
});
