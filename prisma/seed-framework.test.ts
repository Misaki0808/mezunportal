import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedId, seedTime, SEED_MODULES, TEST_ACCOUNT_PLACEHOLDERS } from './seed-framework';
import { seedUuid } from './seed-util';

describe('sahte veri çerçevesi', () => {
  it('kimlik ve zamanı tekrar üretir; ad alanlarını ayırır', () => {
    expect(seedId('user', 'student')).toBe(seedId('user', 'student'));
    expect(seedId('user', 'student')).not.toBe(seedId('profile', 'student'));
    expect(seedId('a:b', 'c')).not.toBe(seedId('a', 'b:c'));
    expect(seedTime().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(seedTime(60).toISOString()).toBe('2026-01-01T01:00:00.000Z');
    expect(() => seedTime(0.5)).toThrow();
  });
  it('altı rol için kimlik bilgisi içermeyen yer tutucu ve kurumları önce çalıştıran sıra sunar', () => {
    expect(new Set(TEST_ACCOUNT_PLACEHOLDERS).size).toBe(6);
    expect(SEED_MODULES.map((seedModule) => seedModule.name)).toEqual([
      'institutions',
      'accounts',
      'profileTags',
      'dictionary',
      'feedback',
      'pointRules',
      'phase2',
    ]);
  });
  it('seedUuid geçerli UUID üretir (arayüze çıkan kimlikler z.uuid() doğrulamasından geçer), deterministik ve ad alanına duyarlıdır', () => {
    const id = seedUuid('phase2', 'company:yazilim');
    expect(z.uuid().safeParse(id).success).toBe(true);
    expect(seedUuid('phase2', 'company:yazilim')).toBe(id);
    expect(seedUuid('phase2', 'company:finans')).not.toBe(id);
    expect(seedUuid('a', 'b')).not.toBe(seedUuid('b', 'a'));
    for (let i = 0; i < 200; i += 1)
      expect(z.uuid().safeParse(seedUuid('t', String(i))).success).toBe(true);
  });
});
