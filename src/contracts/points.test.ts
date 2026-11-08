import { describe, expect, it } from 'vitest';

import { isErrorCode } from '@/lib/errors';

import {
  DEFAULT_POINT_RULES,
  POINT_ACTIONS,
  POINTS_ACTION_ERRORS,
  decideSuspicionSchema,
  getMyContributionSchema,
  pointEntryViewSchema,
  revokePointEntrySchema,
  updatePointRuleSchema,
} from './points';

describe('puan sözleşmesi', () => {
  it('başlangıç tablosu (K-11) her eylemi kapsar ve sırayı korur', () => {
    expect(Object.keys(DEFAULT_POINT_RULES).sort()).toEqual([...POINT_ACTIONS].sort());
    const d = DEFAULT_POINT_RULES;
    expect(d.CV_REVIEW_HELPFUL.points).toBeLessThan(d.SESSION_ONLINE.points);
    expect(d.SESSION_ONLINE.points).toBeLessThan(d.SESSION_IN_PERSON.points);
    expect(d.SESSION_IN_PERSON.delayDays).toBe(7);
    expect(POINT_ACTIONS.filter((a) => d[a].delayDays > 0)).toEqual(['SESSION_IN_PERSON']);
  });

  it('girdi şemaları strict: bilinmeyen alan ve aralık dışı değer reddedilir', () => {
    const rule = {
      action: 'SESSION_ONLINE',
      points: 10,
      delayDays: 0,
      isActive: true,
      reason: 'ayar',
    };
    expect(updatePointRuleSchema.safeParse(rule).success).toBe(true);
    expect(updatePointRuleSchema.safeParse({ ...rule, extra: 1 }).success).toBe(false);
    expect(updatePointRuleSchema.safeParse({ ...rule, points: 101 }).success).toBe(false);
    expect(updatePointRuleSchema.safeParse({ ...rule, points: -1 }).success).toBe(false);
    expect(updatePointRuleSchema.safeParse({ ...rule, points: 1.5 }).success).toBe(false);
    expect(updatePointRuleSchema.safeParse({ ...rule, delayDays: 31 }).success).toBe(false);
    expect(updatePointRuleSchema.safeParse({ ...rule, reason: 'a' }).success).toBe(false);
    expect(revokePointEntrySchema.safeParse({ entryId: 'x', reason: 'yanlış' }).success).toBe(true);
    expect(
      decideSuspicionSchema.safeParse({ flagId: 'x', decision: 'MAYBE', reason: 'abc' }).success,
    ).toBe(false);
    expect(getMyContributionSchema.parse({}).limit).toBe(20);
    expect(getMyContributionSchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('kayıt çıktısında kaynak ve karşı taraf kimliği alanı yoktur (anonimlik)', () => {
    const keys = Object.keys(pointEntryViewSchema.shape);
    for (const forbidden of ['sourceId', 'sourceType', 'counterpartId', 'userId'])
      expect(keys).not.toContain(forbidden);
  });

  it('eylem hata kodlarının hepsi kayıtlıdır', () => {
    for (const codes of Object.values(POINTS_ACTION_ERRORS))
      for (const code of codes) expect(isErrorCode(code)).toBe(true);
  });
});
