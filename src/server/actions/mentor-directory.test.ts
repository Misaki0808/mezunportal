import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireVerifiedMember: vi.fn(),
  service: { searchMentors: vi.fn(), getSimilarMentors: vi.fn(), getMentorEntryPoints: vi.fn() },
}));
vi.mock('../permissions', () => ({ requireVerifiedMember: mocks.requireVerifiedMember }));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/mentor-directory', () => mocks.service);

import * as actions from './mentor-directory';

const ACTOR = { userId: 'oturum-kullanicisi', facts: {} };
beforeEach(() => {
  mocks.requireVerifiedMember.mockReset().mockResolvedValue(ACTOR);
  for (const fn of Object.values(mocks.service)) fn.mockReset();
});

const calls: [string, () => Promise<unknown>, keyof typeof mocks.service][] = [
  ['searchMentors', () => actions.searchMentors({ onlyAvailable: true }), 'searchMentors'],
  ['getSimilarMentors', () => actions.getSimilarMentors(), 'getSimilarMentors'],
  [
    'getMentorEntryPoints',
    () => actions.getMentorEntryPoints({ userId: 'hedef' }),
    'getMentorEntryPoints',
  ],
];

describe('mentor dizini eylemleri', () => {
  it('bütün dışa açık eylemler kapsanır', () => {
    expect(calls.map(([name]) => name).sort()).toEqual(Object.keys(actions).sort());
  });

  it.each(calls)('%s: oturumsuz/yetkisizde servis çağrılmaz', async (_name, call, service) => {
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    mocks.requireVerifiedMember.mockRejectedValueOnce(codedForbidden('AUTH_NOT_VERIFIED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_NOT_VERIFIED' });
    expect(mocks.service[service]).not.toHaveBeenCalled();
  });

  it.each(calls)(
    '%s: oturumdaki aktör ve gerçek bağımlılıklar servise gider',
    async (_name, call, service) => {
      mocks.service[service].mockResolvedValue({ ok: 1 });
      expect(await call()).toEqual({ ok: true, data: { ok: 1 } });
      const args = mocks.service[service].mock.calls[0]!;
      expect(args[0]).toEqual({ db: { marker: 'db' } });
      expect(args[1]).toBe(ACTOR);
    },
  );

  it('doğrulanmış girdi (varsayılanlarla) servise gider', async () => {
    mocks.service.searchMentors.mockResolvedValue({});
    await actions.searchMentors({ mentorTypes: ['ALUMNI'], company: ' Acme ' });
    expect(mocks.service.searchMentors.mock.calls[0]![2]).toEqual({
      mentorTypes: ['ALUMNI'],
      company: 'Acme',
      onlyAvailable: false,
      page: 1,
      pageSize: 12,
    });
  });

  it('geçersiz girdi servise ulaşmaz; kimlik/kapsam alanları reddedilir', async () => {
    for (const result of [
      await actions.searchMentors({ pageSize: 500 }),
      await actions.searchMentors({ universityId: 'baska' } as never),
      await actions.searchMentors({ mentorTypes: [] } as never),
      await actions.getMentorEntryPoints({ userId: '' }),
      await actions.getMentorEntryPoints({ userId: 'x', viewerId: 'baska' } as never),
    ]) {
      expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    }
    expect(mocks.service.searchMentors).not.toHaveBeenCalled();
    expect(mocks.service.getMentorEntryPoints).not.toHaveBeenCalled();
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.service.getSimilarMentors.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await actions.getSimilarMentors()).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });
});
