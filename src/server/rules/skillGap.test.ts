import { describe, expect, it } from 'vitest';
import { calculateSkillGap } from './skillGap';
const dictionary = [
  { id: 'sql', label: 'SQL' },
  { id: 'excel', label: 'Excel' },
  { id: 'rare', label: 'Nadir' },
];
function cohort(n: number, sql: number, excel = 0, rare = 0) {
  return Array.from({ length: n }, (_, i) => [
    ...(i < sql ? ['sql'] : []),
    ...(i < excel ? ['excel'] : []),
    ...(i < rare ? ['rare'] : []),
  ]);
}
describe('beceri açığı', () => {
  it.each([
    [4, 2],
    [5, 1],
    [9, 5],
    [10, 4],
    [10, 6],
    [11, 7],
  ])('her iki hücre 5 değilse bastırır (%s,%s)', (n, count) => {
    expect(calculateSkillGap(cohort(n, count), [], [dictionary[0]!])).toBeNull();
  });
  it.each([
    [10, 5, 50, '10+'],
    [21, 9, 45, '10+'],
    [25, 7, 30, '25+'],
    [50, 7, 15, '50+'],
  ])('yuvarlanmış yüzde ve bant %s/%s', (n, count, percent, band) => {
    expect(calculateSkillGap(cohort(n as number, count as number), [], [dictionary[0]!])).toEqual({
      band,
      progress: 0,
      missing: [{ id: 'sql', label: 'SQL', percent }],
    });
  });
  it('küme farkı, her iki taraf ve tamamlayıcı bastırma: gizli beceri sayısı veya toplam yok', () => {
    const result = calculateSkillGap(cohort(10, 5, 5, 1), ['sql'], dictionary);
    expect(result).toEqual({
      band: '10+',
      progress: 50,
      missing: [{ id: 'excel', label: 'Excel', percent: 50 }],
    });
    expect(JSON.stringify(result)).not.toMatch(/rare|Nadir|total|count|user/i);
    expect(result).toEqual(calculateSkillGap(cohort(10, 5, 5, 0), ['sql'], dictionary));
    expect(result).toEqual(calculateSkillGap(cohort(10, 5, 5, 9), ['sql'], dictionary));
  });
  it('aynı mezunun tekrar becerisi iki kez sayılmaz', () => {
    const rows = [['sql', 'sql'], ...cohort(9, 4)];
    expect(calculateSkillGap(rows, [], [dictionary[0]!])?.missing[0]?.percent).toBe(50);
  });
});
