import { describe, expect, it } from 'vitest';

import { SIMILAR_MENTORS_MAX, similarMentorsSchema } from '@/contracts/mentor-directory';

import {
  rankSimilar,
  scoreSimilarity,
  type PathItem,
  type PathSignals,
  type SimilarityCandidate,
} from './similarity';

const items = (...labels: string[]): PathItem[] =>
  labels.map((label) => ({ key: label.toLowerCase(), label }));
const signals = (patch: Partial<PathSignals> = {}): PathSignals => ({
  sectors: [],
  interests: [],
  skills: [],
  goals: [],
  departments: [],
  ...patch,
});
const viewer = signals({
  sectors: items('Finans'),
  interests: items('data', 'software'),
  skills: items('SQL', 'Python'),
  goals: items('internship', 'career'),
  departments: items('YBS'),
});

describe('scoreSimilarity', () => {
  it('ortak öğe yoksa öneri yok', () => {
    expect(scoreSimilarity(viewer, signals())).toBeNull();
    expect(scoreSimilarity(viewer, signals({ interests: items('marketing') }))).toBeNull();
  });

  it('yalnız ortak hedef ve bölüm yetmez (güçlü gerekçe şart)', () => {
    expect(
      scoreSimilarity(viewer, signals({ goals: items('internship'), departments: items('YBS') })),
    ).toBeNull();
  });

  it('her güçlü gerekçe tek başına yeter; gerekçe etiketi ve ortak değerler döner', () => {
    expect(scoreSimilarity(viewer, signals({ sectors: items('Finans') }))).toEqual({
      score: 6,
      reasons: [{ code: 'SAME_SECTOR', values: ['Finans'] }],
    });
    expect(scoreSimilarity(viewer, signals({ interests: items('data') }))).toEqual({
      score: 4,
      reasons: [{ code: 'SHARED_INTEREST', values: ['data'] }],
    });
    expect(scoreSimilarity(viewer, signals({ skills: items('SQL') }))).toEqual({
      score: 3,
      reasons: [{ code: 'SHARED_SKILL', values: ['SQL'] }],
    });
  });

  it('puanlar toplanır, tavanlar uygulanır, gerekçeler önem sırasındadır', () => {
    const full = scoreSimilarity(
      viewer,
      signals({
        sectors: items('Finans'),
        interests: items('data', 'software', 'erp'),
        skills: items('SQL', 'Python'),
        goals: items('internship', 'career'),
        departments: items('YBS'),
      }),
    );
    // sektör 6 + ilgi 2×4 + beceri 2×3 + hedef 2×2 + bölüm 1
    expect(full?.score).toBe(6 + 8 + 6 + 4 + 1);
    expect(full?.reasons.map((reason) => reason.code)).toEqual([
      'SAME_SECTOR',
      'SHARED_INTEREST',
      'SHARED_SKILL',
      'SHARED_GOAL',
      'SAME_DEPARTMENT',
    ]);
  });

  it('puan tavanı: ortak öğe sayısı tavanı aşınca puan artmaz, gerekçe değerleri en çok 3', () => {
    const wide = signals({
      interests: items('a', 'b', 'c', 'd', 'e'),
    });
    const bigViewer = signals({ interests: items('a', 'b', 'c', 'd', 'e') });
    const result = scoreSimilarity(bigViewer, wide)!;
    expect(result.score).toBe(12); // 3 × 4 (tavan 3)
    expect(result.reasons[0]!.values).toEqual(['a', 'b', 'c']);
  });

  it('değerler yalnız ortak öğelerdir (adayın başka öğeleri sızmaz), büyük/küçük harf anahtarı birleştirir', () => {
    const result = scoreSimilarity(
      signals({ skills: [{ key: 'sql', label: 'SQL' }] }),
      signals({
        skills: [
          { key: 'sql', label: 'sql' },
          { key: 'gizli', label: 'Gizli Beceri' },
        ],
      }),
    )!;
    expect(result.reasons).toEqual([{ code: 'SHARED_SKILL', values: ['SQL'] }]);
    expect(JSON.stringify(result)).not.toContain('Gizli');
  });

  it('yinelenen arayan öğesi iki kez sayılmaz', () => {
    const result = scoreSimilarity(
      signals({ interests: [...items('data'), ...items('data')] }),
      signals({ interests: items('data') }),
    )!;
    expect(result.score).toBe(4);
  });
});

describe('rankSimilar', () => {
  const candidate = (id: string, patch: Partial<PathSignals>): SimilarityCandidate => ({
    id,
    signals: signals(patch),
  });

  it('puana göre sıralar; eşitlikte gerekçe sayısı, sonra kimlik', () => {
    const ranked = rankSimilar(viewer, [
      candidate('c', { interests: items('data') }), // 4
      candidate('a', { sectors: items('Finans') }), // 6
      candidate('b', { skills: items('SQL'), goals: items('career') }), // 3+2=5
      candidate('e', { interests: items('data') }), // 4, aynı gerekçe sayısı
      candidate('d', { skills: items('SQL'), goals: items('internship') }), // 5
    ]);
    expect(ranked.map((match) => match.id)).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('eşit puanda daha çok gerekçesi olan öne geçer', () => {
    const ranked = rankSimilar(
      signals({ interests: items('data'), skills: items('SQL'), goals: items('career') }),
      [
        candidate('z', { interests: items('data') }), // 4
        candidate('y', { skills: items('SQL'), goals: items('career') }), // 3+2=5
        candidate('x', { interests: items('data'), departments: items('YBS') }), // 4 (bölüm ortak değil)
      ],
    );
    expect(ranked.map((match) => match.id)).toEqual(['y', 'x', 'z']);
  });

  it('en çok 5 öneri; limit 5’i aşamaz', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      candidate(`m${String(index).padStart(2, '0')}`, { interests: items('data') }),
    );
    expect(rankSimilar(viewer, many)).toHaveLength(SIMILAR_MENTORS_MAX);
    expect(rankSimilar(viewer, many, 99)).toHaveLength(SIMILAR_MENTORS_MAX);
    expect(rankSimilar(viewer, many, 2)).toHaveLength(2);
    expect(rankSimilar(viewer, many, 0)).toEqual([]);
  });

  it('girdi sırası sonucu değiştirmez', () => {
    const list = [
      candidate('b', { interests: items('data') }),
      candidate('a', { interests: items('data') }),
      candidate('c', { sectors: items('Finans') }),
    ];
    expect(rankSimilar(viewer, list)).toEqual(rankSimilar(viewer, [...list].reverse()));
  });

  it('hiçbir şey eşleşmezse boş; aday olmayan arayanda (sinyalsiz) boş', () => {
    expect(rankSimilar(viewer, [candidate('a', {})])).toEqual([]);
    expect(rankSimilar(signals(), [candidate('a', { interests: items('data') })])).toEqual([]);
    expect(rankSimilar(viewer, [])).toEqual([]);
  });

  it('çıktı sözleşme şemasına uyar (gerekçesiz öğe üretmez)', () => {
    const ranked = rankSimilar(viewer, [
      candidate('a', { sectors: items('Finans'), goals: items('career') }),
    ]);
    for (const match of ranked) expect(match.reasons.length).toBeGreaterThan(0);
    expect(
      similarMentorsSchema.shape.items.element.shape.reasons.safeParse(ranked[0]!.reasons).success,
    ).toBe(true);
  });
});
