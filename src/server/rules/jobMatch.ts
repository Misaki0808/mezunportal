import { computeClassStanding } from './classYear';

/** Tek ortak etiket yeterlidir; eşik merkezi olarak ayarlanır ve test edilir. */
export const JOB_MATCH_THRESHOLDS = { minimumSharedTags: 1 } as const;
export type JobMatchPosting = {
  targetDepartmentIds: readonly string[];
  tagIds: readonly string[];
  minGrade?: number | null;
  maxGrade?: number | null;
};
export type JobMatchStudent = {
  departmentId: string;
  entryYear: number | null;
  classOffset: number;
  tagIds: readonly string[];
};
export type JobMatchResult = { matches: boolean; sharedTagIds: string[] };

/** Tamamen saf: bölüm, İstanbul akademik yılına göre sınıf ve tekilleştirilmiş etiket kesişimi. */
export function matchJobPosting(
  posting: JobMatchPosting,
  student: JobMatchStudent,
  now: Date,
): JobMatchResult {
  const noMatch: JobMatchResult = { matches: false, sharedTagIds: [] };
  if (!posting.targetDepartmentIds.includes(student.departmentId)) return noMatch;
  const standing = computeClassStanding(
    { entryYear: student.entryYear, classOffset: student.classOffset },
    now,
  );
  if (standing.kind !== 'GRADE') return noMatch;
  if (posting.minGrade != null && standing.grade < posting.minGrade) return noMatch;
  if (posting.maxGrade != null && standing.grade > posting.maxGrade) return noMatch;
  const requested = new Set(posting.tagIds);
  const sharedTagIds = [...new Set(student.tagIds)].filter((id) => requested.has(id)).sort();
  return sharedTagIds.length >= JOB_MATCH_THRESHOLDS.minimumSharedTags
    ? { matches: true, sharedTagIds }
    : noMatch;
}

/** Kişi listesi yerine k-anonim sunum için yalnız toplu sayı. */
export function publicReach(
  count: number,
): { belowThreshold: true; count: null } | { belowThreshold: false; count: number } {
  if (count < 3) return { belowThreshold: true, count: null };
  return { belowThreshold: false, count };
}
