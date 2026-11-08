import { computeClassStanding } from './classYear';

/** Bildirim için gereken en az ortak etiket sayısı. */
export const JOB_MATCH_THRESHOLDS = { minTags: 1 } as const;
export type JobMatchPosting = {
  targetDepartmentIds: readonly string[];
  tagIds: readonly string[];
  targetGrades: readonly number[];
};
export type JobMatchStudent = {
  departmentId: string;
  entryYear: number | null;
  classOffset: number;
  tagIds: readonly string[];
};
export type JobMatchResult = {
  matches: boolean;
  dashboardEligible: boolean;
  sharedTagIds: string[];
};

/** Etiketsiz ilan uygun bölüm ve sınıfta panoda görünür, bildirim üretmez. */
export function matchJobPosting(
  posting: JobMatchPosting,
  student: JobMatchStudent,
  now: Date,
): JobMatchResult {
  const noMatch: JobMatchResult = { matches: false, dashboardEligible: false, sharedTagIds: [] };
  if (!posting.targetDepartmentIds.includes(student.departmentId)) return noMatch;
  if (posting.targetGrades.length > 0) {
    const standing = computeClassStanding(
      { entryYear: student.entryYear, classOffset: student.classOffset },
      now,
    );
    if (standing.kind !== 'GRADE' || !posting.targetGrades.includes(standing.grade)) return noMatch;
  }
  const requested = new Set(posting.tagIds);
  const sharedTagIds = [...new Set(student.tagIds)].filter((id) => requested.has(id)).sort();
  const matches = sharedTagIds.length >= JOB_MATCH_THRESHOLDS.minTags;
  return { matches, dashboardEligible: matches || requested.size === 0, sharedTagIds };
}

/** Kişi listesi yerine k-anonim sunum için yalnız toplu sayı. */
export function publicReach(
  count: number,
): { belowThreshold: true; count: null } | { belowThreshold: false; count: number } {
  if (count < 3) return { belowThreshold: true, count: null };
  return { belowThreshold: false, count };
}
