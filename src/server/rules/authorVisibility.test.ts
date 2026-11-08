import { describe, expect, it } from 'vitest';

import { isAuthorVisible } from './authorVisibility';

const NOW = new Date('2026-11-08T12:00:00Z');
const active = { deletedAt: null, banned: false, banExpires: null };

describe('isAuthorVisible', () => {
  it.each([
    ['etkin yazar', active, true],
    ['yazar yok (bağ koptu)', null, false],
    ['yazar tanımsız', undefined, false],
    ['silinmiş yazar', { ...active, deletedAt: new Date('2026-01-01') }, false],
    ['süresiz askıdaki yazar', { ...active, banned: true }, false],
    ['süreli askı sürüyor', { ...active, banned: true, banExpires: new Date('2026-12-01') }, false],
    ['süreli askı tam şimdi bitiyor', { ...active, banned: true, banExpires: NOW }, true],
    ['süreli askı bitmiş', { ...active, banned: true, banExpires: new Date('2026-11-01') }, true],
    ['askı tarihi var ama banned=false', { ...active, banExpires: new Date('2027-01-01') }, true],
    [
      'hem silinmiş hem askıda',
      { deletedAt: new Date('2026-01-01'), banned: true, banExpires: null },
      false,
    ],
  ] as const)('%s → %s', (_name, author, expected) => {
    expect(isAuthorVisible(author as never, NOW)).toBe(expected);
  });
});
