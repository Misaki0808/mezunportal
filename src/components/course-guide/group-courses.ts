/** Sorgu sırasını her grup içinde korur; gizlenen sayıları hesaplamaz veya yeniden üretmez. */
export function groupGuideCourses<
  T extends { code: string; semester: number; count: number | null },
>(courses: readonly T[]) {
  return (['department', 'common'] as const).map((category) => {
    const selected = courses.filter((course) =>
      category === 'department' ? course.code.startsWith('YBSB') : !course.code.startsWith('YBSB'),
    );
    const reviewed = selected.filter((course) => course.count !== null);
    const groups = new Map<number, T[]>();
    for (const course of selected) {
      if (course.count !== null) continue;
      const items = groups.get(course.semester) ?? [];
      items.push(course);
      groups.set(course.semester, items);
    }
    return {
      category,
      reviewed,
      semesters: [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([semester, items]) => ({ semester, courses: items })),
    };
  });
}
