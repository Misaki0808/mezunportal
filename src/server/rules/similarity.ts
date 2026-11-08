import {
  SIMILAR_MENTORS_MAX,
  type SimilarityReason,
  type SimilarityReasonCode,
} from '@/contracts/mentor-directory';

/**
 * "Sana benzer yol izleyenler" kuralı (saf; veritabanına dokunmaz). Arayanın ve adayın yol işaretleri (sektör,
 * ilgi, beceri, hedef, bölüm) kesişimiyle puanlanır; her kesişim bir GEREKÇE etiketidir ve gerekçedeki değerler
 * yalnız iki tarafın da sahip olduğu öğelerdir (arayana yeni bilgi sızdırmaz).
 *
 * Uygunluk: en az bir GÜÇLÜ gerekçe (ortak sektör, ilgi ya da beceri) gerekir; yalnız ortak hedef/bölüm öneri
 * sebebi değildir (yalnız puanı artırır). Sıra: puan ↓, gerekçe sayısı ↓, kimlik ↑ (deterministik).
 */
export type PathItem = { key: string; label: string };
export type PathSignals = {
  sectors: readonly PathItem[];
  interests: readonly PathItem[];
  skills: readonly PathItem[];
  goals: readonly PathItem[];
  departments: readonly PathItem[];
};
export type SimilarityCandidate = { id: string; signals: PathSignals };
export type SimilarityMatch = { id: string; score: number; reasons: SimilarityReason[] };

type Component = {
  code: SimilarityReasonCode;
  field: keyof PathSignals;
  /** Ortak öğe başına puan. */
  weight: number;
  /** Puana en çok kaç ortak öğe sayılır. */
  cap: number;
  strong: boolean;
};

/** Gerekçe sırası = önem sırası. */
export const SIMILARITY_COMPONENTS: readonly Component[] = [
  { code: 'SAME_SECTOR', field: 'sectors', weight: 6, cap: 1, strong: true },
  { code: 'SHARED_INTEREST', field: 'interests', weight: 4, cap: 3, strong: true },
  { code: 'SHARED_SKILL', field: 'skills', weight: 3, cap: 3, strong: true },
  { code: 'SHARED_GOAL', field: 'goals', weight: 2, cap: 2, strong: false },
  { code: 'SAME_DEPARTMENT', field: 'departments', weight: 1, cap: 1, strong: false },
];

const REASON_VALUES_MAX = 3;

export function scoreSimilarity(
  viewer: PathSignals,
  candidate: PathSignals,
): { score: number; reasons: SimilarityReason[] } | null {
  let score = 0;
  let strong = false;
  const reasons: SimilarityReason[] = [];
  for (const component of SIMILARITY_COMPONENTS) {
    const theirs = new Set(candidate[component.field].map((item) => item.key));
    const shared = new Map<string, string>();
    for (const item of viewer[component.field]) {
      if (theirs.has(item.key) && !shared.has(item.key)) shared.set(item.key, item.label);
    }
    if (shared.size === 0) continue;
    score += component.weight * Math.min(shared.size, component.cap);
    strong ||= component.strong;
    reasons.push({
      code: component.code,
      values: [...shared.values()]
        .sort((a, b) => a.localeCompare(b, 'tr-TR'))
        .slice(0, REASON_VALUES_MAX),
    });
  }
  return strong ? { score, reasons } : null;
}

export function rankSimilar(
  viewer: PathSignals,
  candidates: readonly SimilarityCandidate[],
  limit: number = SIMILAR_MENTORS_MAX,
): SimilarityMatch[] {
  const matches: SimilarityMatch[] = [];
  for (const candidate of candidates) {
    const result = scoreSimilarity(viewer, candidate.signals);
    if (result) matches.push({ id: candidate.id, ...result });
  }
  matches.sort(
    (a, b) =>
      b.score - a.score ||
      b.reasons.length - a.reasons.length ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return matches.slice(0, Math.max(0, Math.min(limit, SIMILAR_MENTORS_MAX)));
}
