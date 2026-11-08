import { describe, expect, it } from 'vitest';
import { applicationDistribution, applicationWindowCycle } from './application-window';
describe('başvuru dağılımı', () => {
  it('üç farklı yazardan azını gizler; bir yazarı bir kez sayar', () => {
    const row = (authorId: string) => ({
      authorId,
      appliedMonth: 4,
      termSeason: 'SPRING' as const,
    });
    expect(applicationDistribution([row('a'), row('a'), row('b')])).toEqual([]);
    expect(applicationDistribution([row('a'), row('a'), row('b'), row('c')])).toEqual([
      { month: 4, count: 3 },
    ]);
  });
  it('ay bilinmiyorsa mevsimin aylarına düşer; açık ay varsa mevsimi kullanmaz', () => {
    const rows = ['a', 'b', 'c'].map((authorId) => ({
      authorId,
      appliedMonth: null,
      termSeason: 'WINTER' as const,
    }));
    expect(applicationDistribution(rows)).toEqual([
      { month: 1, count: 3 },
      { month: 2, count: 3 },
      { month: 12, count: 3 },
    ]);
  });
  it.each([
    ['2026-02-28T20:59:59Z', null],
    ['2026-02-28T21:00:00Z', '2026-03'],
    ['2026-03-01T20:59:59Z', '2026-03'],
    ['2026-03-01T21:00:00Z', null],
  ])('İstanbul ay sınırı %s', (value, expected) =>
    expect(applicationWindowCycle(new Date(value))).toBe(expected),
  );
});
