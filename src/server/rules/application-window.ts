import { istanbulDay } from './jobPosting';

export const APPLICATION_WINDOW_MIN_AUTHORS = 3;
export type ApplicationMonthRow = {
  authorId: string;
  appliedMonth: number | null;
  termSeason: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | null;
};
const SEASON_MONTHS = {
  SPRING: [3, 4, 5],
  SUMMER: [6, 7, 8],
  AUTUMN: [9, 10, 11],
  WINTER: [12, 1, 2],
} as const;
/** Ay yoksa mevsimin üç ayı yaklaşık kabul edilir; bir yazar her ayda en çok bir kez sayılır. */
export function applicationDistribution(rows: readonly ApplicationMonthRow[]) {
  const buckets = Array.from({ length: 12 }, () => new Set<string>());
  for (const row of rows) {
    const months = row.appliedMonth
      ? [row.appliedMonth]
      : row.termSeason
        ? SEASON_MONTHS[row.termSeason]
        : [];
    for (const month of months)
      if (month >= 1 && month <= 12) buckets[month - 1]!.add(row.authorId);
  }
  return buckets.flatMap((authors, index) =>
    authors.size >= APPLICATION_WINDOW_MIN_AUTHORS
      ? [{ month: index + 1, count: authors.size }]
      : [],
  );
}
/** İş sadece İstanbul'da ayın birinci günü niyet üretir. */
export function applicationWindowCycle(now: Date): string | null {
  const day = istanbulDay(now);
  return day.endsWith('-01') ? day.slice(0, 7) : null;
}
