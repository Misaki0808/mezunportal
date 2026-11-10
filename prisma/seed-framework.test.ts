import { describe, expect, it } from 'vitest';
import { seedId, seedTime, SEED_MODULES, TEST_ACCOUNT_PLACEHOLDERS } from './seed-framework';
import { seedUuid } from './seed-util';

describe('sahte veri çerçevesi', () => {
  it('seedUuid: deterministik, ad alanlarını ayırır ve gerçek UUID biçimindedir', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(seedUuid('phase2', 'company:a')).toMatch(uuid);
    expect(seedUuid('phase2', 'company:a')).toBe(seedUuid('phase2', 'company:a'));
    expect(seedUuid('phase2', 'company:a')).not.toBe(seedUuid('phase2', 'company:b'));
    expect(seedUuid('a:b', 'c')).not.toBe(seedUuid('a', 'b:c'));
  });

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
      'courses',
      'accounts',
      'profileTags',
      'dictionary',
      'feedback',
      'pointRules',
      'phase2',
    ]);
  });
});
