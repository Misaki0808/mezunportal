import { describe, expect, it } from 'vitest';

import { VISIBILITY_LEVELS } from '@/contracts/privacy';

import { VIEWER_RELATIONS, VISIBILITY_DECISION_TABLE, DEFAULT_FIELD_ACCESS } from './visibility';

// Sözleşme: karar tablosunun kendisi (gövde servis kartında bu tabloya karşı test edilir).
const access = (level: string, relation: string) =>
  VISIBILITY_DECISION_TABLE.find((row) => row.level === level && row.relation === relation)
    ?.access ?? DEFAULT_FIELD_ACCESS;

describe('görünürlük karar tablosu', () => {
  it('her seviye × ilişki tam bir kez tanımlıdır', () => {
    expect(VISIBILITY_DECISION_TABLE).toHaveLength(
      VISIBILITY_LEVELS.length * VIEWER_RELATIONS.length,
    );
    for (const level of VISIBILITY_LEVELS) {
      for (const relation of VIEWER_RELATIONS) {
        expect(
          VISIBILITY_DECISION_TABLE.filter(
            (row) => row.level === level && row.relation === relation,
          ),
          `${level}/${relation}`,
        ).toHaveLength(1);
      }
    }
  });

  it.each(VISIBILITY_LEVELS)(
    '%s: sahibi tam görür; yönetici görevde yalnız maskeli; dışarıdaki hiç görmez',
    (level) => {
      expect(access(level, 'OWNER')).toBe('FULL');
      expect(access(level, 'ADMIN_TASK')).toBe('MASKED');
      expect(access(level, 'OTHER')).toBe('NONE');
    },
  );

  it('PRIVATE: sahibi dışında kimse tam görmez (onaylı talep bile)', () => {
    expect(access('PRIVATE', 'APPROVED_REQUESTER')).toBe('NONE');
    expect(access('PRIVATE', 'VERIFIED_MEMBER')).toBe('NONE');
  });

  it('ON_APPROVED_REQUEST: yalnız onaylı talep sahibi tam görür, diğer üyeler görmez', () => {
    expect(access('ON_APPROVED_REQUEST', 'APPROVED_REQUESTER')).toBe('FULL');
    expect(access('ON_APPROVED_REQUEST', 'VERIFIED_MEMBER')).toBe('NONE');
  });

  it('MEMBERS: doğrulanmış üyeler tam görür', () => {
    expect(access('MEMBERS', 'VERIFIED_MEMBER')).toBe('FULL');
  });
});

it('bilinmeyen seviye/ilişki ve eksik eşleşme için sözleşme varsayılanı gizlidir', () => {
  expect(DEFAULT_FIELD_ACCESS).toBe('NONE');
  expect(access('PUBLIC', 'VERIFIED_MEMBER')).toBe('NONE');
  expect(access('MEMBERS', 'UNKNOWN')).toBe('NONE');
});
