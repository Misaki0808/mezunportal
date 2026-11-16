import { expect, it } from 'vitest';
import { homeDate, homeGreeting } from './presentation';

it.each([
  ['2026-11-16T02:59:00Z', 'night'],
  ['2026-11-16T03:00:00Z', 'morning'],
  ['2026-11-16T08:59:00Z', 'morning'],
  ['2026-11-16T09:00:00Z', 'day'],
  ['2026-11-16T14:59:00Z', 'day'],
  ['2026-11-16T15:00:00Z', 'evening'],
  ['2026-11-16T18:59:00Z', 'evening'],
  ['2026-11-16T19:00:00Z', 'night'],
])('İstanbul selamı %s → %s', (date, expected) => {
  expect(homeGreeting(new Date(date))).toBe(expected);
});
it('UTC gece yarısından önce Türkiye gününü gösterir', () => {
  expect(homeDate(new Date('2026-11-15T21:30:00Z'), { day: 'numeric' })).toBe('16');
});
