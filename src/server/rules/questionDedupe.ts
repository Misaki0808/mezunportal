import { foldTr } from './faq';

/** pg_trgm similarity eşiği; sonuç deterministik, her deneyim grupta bir kez sayılır. */
export const QUESTION_SIMILARITY_THRESHOLD = 0.7;
export const QUESTION_MIN_AUTHORS = 3;

export function questionTrigrams(value: string): Set<string> {
  const words = foldTr(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  const grams = new Set<string>();
  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i <= padded.length - 3; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** pg_trgm'nin benzersiz trigram kümeleri üzerindeki Jaccard benzerliği. */
export function questionSimilarity(a: string, b: string): number {
  return trigramSimilarity(questionTrigrams(a), questionTrigrams(b));
}
function trigramSimilarity(left: Set<string>, right: Set<string>): number {
  let common = 0;
  for (const gram of left) if (right.has(gram)) common++;
  const union = left.size + right.size - common;
  return union ? common / union : 0;
}

export type QuestionCandidate = {
  text: string;
  experienceId: string;
  authorId: string;
  category: 'QUESTION' | 'PROCESS';
};
export type QuestionGroup = { text: string; count: number; category: 'QUESTION' | 'PROCESS' };

export function groupQuestions(candidates: readonly QuestionCandidate[]): QuestionGroup[] {
  const ordered = [...candidates].sort(
    (a, b) => a.text.localeCompare(b.text, 'tr-TR') || a.experienceId.localeCompare(b.experienceId),
  );
  const groups: {
    text: string;
    category: QuestionCandidate['category'];
    experiences: Set<string>;
    authors: Set<string>;
    grams: Set<string>;
  }[] = [];
  for (const item of ordered) {
    const grams = questionTrigrams(item.text);
    const match = groups.find(
      (group) =>
        group.category === item.category &&
        Math.min(group.grams.size, grams.size) >=
          QUESTION_SIMILARITY_THRESHOLD * Math.max(group.grams.size, grams.size) &&
        trigramSimilarity(group.grams, grams) >= QUESTION_SIMILARITY_THRESHOLD,
    );
    if (match) {
      match.experiences.add(item.experienceId);
      match.authors.add(item.authorId);
    } else {
      groups.push({
        text: item.text,
        category: item.category,
        experiences: new Set([item.experienceId]),
        authors: new Set([item.authorId]),
        grams,
      });
    }
  }
  return groups
    .filter((group) => group.authors.size >= QUESTION_MIN_AUTHORS)
    .map((group) => ({
      text: group.text,
      count: group.experiences.size,
      category: group.category,
    }));
}
