import { describe, expect, it } from 'vitest';
import {
  groupQuestions,
  questionSimilarity,
  QUESTION_SIMILARITY_THRESHOLD,
} from './questionDedupe';

describe('soru benzerliği', () => {
  it.each([
    ['SQL NEDİR?', 'sql nedir', 1],
    ['Takım çalışması', 'TAKIM ÇALIŞMASI', 1],
    ['SQL nedir', 'Ekip nedir', 0],
  ])('%s / %s', (left, right, minimum) => {
    expect(questionSimilarity(left, right)).toBeGreaterThanOrEqual(minimum);
  });
  it('eşik üstündeki tekrarları gruplar, tek deneyimi bir kez sayar ve üç farklı yazardan azını gizler', () => {
    const common = { text: 'SQL nedir?', category: 'QUESTION' as const };
    expect(questionSimilarity('SQL nedir?', 'sql nedir')).toBeGreaterThanOrEqual(
      QUESTION_SIMILARITY_THRESHOLD,
    );
    expect(
      groupQuestions([
        { ...common, authorId: 'a', experienceId: '1' },
        { ...common, authorId: 'a', experienceId: '1' },
        { ...common, authorId: 'b', experienceId: '2' },
      ]),
    ).toEqual([]);
    expect(
      groupQuestions([
        { ...common, authorId: 'a', experienceId: '1' },
        { ...common, authorId: 'a', experienceId: '1' },
        { ...common, authorId: 'b', experienceId: '2' },
        { ...common, authorId: 'c', experienceId: '3' },
      ]),
    ).toEqual([{ text: 'SQL nedir?', category: 'QUESTION', count: 3 }]);
  });
  it('eşik üstündeki yakın ama aynı olmayan metinler üç deneyimde tek grup olur', () => {
    const group = groupQuestions([
      { text: 'SQL nedir?', authorId: 'a', experienceId: '1', category: 'QUESTION' },
      { text: 'SQL nedir ne', authorId: 'b', experienceId: '2', category: 'QUESTION' },
      { text: 'SQL nedir?', authorId: 'c', experienceId: '3', category: 'QUESTION' },
    ]);
    expect(group).toHaveLength(1);
    expect(group[0]?.count).toBe(3);
  });
});
