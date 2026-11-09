/** Hiçbir kullanıcı kimliği çıktı verisine girmez. Her iki hücre en az beş olmalıdır. */
export const SKILL_GAP_MIN_CELL = 5;
export const SKILL_GAP_MAX_MISSING = 10;
export type SkillGapBand = '10+' | '25+' | '50+';
export type SkillGapCandidate = { id: string; label: string };
export type SkillGapResult = {
  band: SkillGapBand;
  progress: number;
  missing: { id: string; label: string; percent: number }[];
} | null;
const roundFive = (value: number) => Math.round(value / 5) * 5;

/** Girdi her mezun için tek beceri kümesidir; küçük hücreler ve tamamlayıcıları tamamen bastırılır. */
export function calculateSkillGap(
  alumni: readonly (readonly string[])[],
  studentSkills: readonly string[],
  dictionary: readonly SkillGapCandidate[],
): SkillGapResult {
  const total = alumni.length;
  if (total < SKILL_GAP_MIN_CELL * 2) return null;
  const counts = new Map<string, number>();
  for (const skills of alumni)
    for (const id of new Set(skills)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const student = new Set(studentSkills);
  const visible = dictionary.flatMap((skill) => {
    const count = counts.get(skill.id) ?? 0;
    if (count < SKILL_GAP_MIN_CELL || total - count < SKILL_GAP_MIN_CELL) return [];
    return [{ ...skill, percent: roundFive((100 * count) / total), owned: student.has(skill.id) }];
  });
  if (!visible.length) return null;
  const progress = roundFive((100 * visible.filter((item) => item.owned).length) / visible.length);
  const missing = visible
    .filter((item) => !item.owned)
    .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label, 'tr-TR'))
    .slice(0, SKILL_GAP_MAX_MISSING)
    .map(({ id, label, percent }) => ({ id, label, percent }));
  return { band: total >= 50 ? '50+' : total >= 25 ? '25+' : '10+', progress, missing };
}
