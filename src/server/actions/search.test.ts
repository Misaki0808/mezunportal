import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ requireVerifiedMember: vi.fn(), search: vi.fn() }));
vi.mock('../permissions', () => ({ requireVerifiedMember: mocks.requireVerifiedMember }));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/search', () => ({ searchExperiences: mocks.search }));

import { searchExperiences } from './search';

const ACTOR = { userId: 'oturum-kullanicisi', facts: {} };

beforeEach(() => {
  mocks.requireVerifiedMember.mockReset().mockResolvedValue(ACTOR);
  mocks.search.mockReset();
});

describe('searchExperiences eylemi', () => {
  it('oturumsuz ve doğrulanmamış kullanıcıda girdi işlenmez, servis çağrılmaz', async () => {
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await searchExperiences({ q: 'staj' })).toEqual({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedForbidden('AUTH_NOT_VERIFIED'));
    expect(await searchExperiences({ q: 'staj' })).toEqual({
      ok: false,
      errorCode: 'AUTH_NOT_VERIFIED',
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('geçersiz süzgeç VALIDATION_INVALID; yetki/kapsam alanları reddedilir', async () => {
    for (const input of [
      { q: 'a' },
      { types: ['ROCKET'] },
      { page: 0 },
      { pageSize: 500 },
      { universityId: 'baska-uni' },
      { authorId: 'x' },
    ]) {
      expect(await searchExperiences(input as never)).toMatchObject({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
      });
    }
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('servise oturumdaki kullanıcı ve doğrulanmış süzgeç gider; sonuç sarılır', async () => {
    const page = { items: [], page: 1, pageSize: 20, total: 0, hasMore: false, sort: 'NEWEST' };
    mocks.search.mockResolvedValue(page);
    expect(await searchExperiences({ q: '  staj  ', types: ['INTERNSHIP'] })).toEqual({
      ok: true,
      data: page,
    });
    const [deps, actor, filter] = mocks.search.mock.calls[0]!;
    expect(deps).toEqual({ db: { marker: 'db' } });
    expect(actor).toBe(ACTOR);
    expect(filter).toEqual({ q: 'staj', types: ['INTERNSHIP'], page: 1, pageSize: 20 });
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.search.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await searchExperiences({})).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });
});
