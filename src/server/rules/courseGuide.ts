/** Small cells and their complements are hidden together, so counts cannot expose a small sector. */
export function summarizeCourseMarks(
  total: number,
  sectors: readonly { name: string; count: number }[],
) {
  if (total < 3) return { count: null, sectors: [] as string[] };
  const safe = sectors.every(
    ({ count }) => count >= 3 && (total - count === 0 || total - count >= 3),
  );
  return { count: total, sectors: safe ? sectors.map(({ name }) => name) : [] };
}
