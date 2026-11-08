import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireVerifiedMember: vi.fn(),
  service: {
    getMyProfile: vi.fn(),
    getProfile: vi.fn(),
    updateProfileBasics: vi.fn(),
    setSocialLinks: vi.fn(),
    setLinkedinUrl: vi.fn(),
    saveProfileEntry: vi.fn(),
    deleteProfileEntry: vi.fn(),
    addProfileSkill: vi.fn(),
    removeProfileSkill: vi.fn(),
    suggestSkills: vi.fn(),
  },
}));
vi.mock('../permissions', () => ({
  requireUser: mocks.requireUser,
  requireVerifiedMember: mocks.requireVerifiedMember,
}));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/profile-content', () => mocks.service);

import * as actions from './profile-content';

const ACTOR = { userId: 'oturum-kullanicisi', facts: {} };
beforeEach(() => {
  mocks.requireUser.mockReset().mockResolvedValue(ACTOR);
  mocks.requireVerifiedMember.mockReset().mockResolvedValue(ACTOR);
  for (const fn of Object.values(mocks.service)) fn.mockReset();
});

const calls: [string, () => Promise<unknown>, 'user' | 'member'][] = [
  ['getMyProfile', () => actions.getMyProfile(), 'user'],
  ['getProfile', () => actions.getProfile({ userId: 'x' }), 'member'],
  ['updateProfileBasics', () => actions.updateProfileBasics({ headline: 'a' }), 'user'],
  ['setSocialLinks', () => actions.setSocialLinks({ links: [] }), 'user'],
  ['setLinkedinUrl', () => actions.setLinkedinUrl({ url: null }), 'user'],
  [
    'saveProfileEntry',
    () => actions.saveProfileEntry({ section: 'LANGUAGE', values: { name: 'x' } }),
    'user',
  ],
  [
    'deleteProfileEntry',
    () => actions.deleteProfileEntry({ section: 'LANGUAGE', id: 'x' }),
    'user',
  ],
  ['addProfileSkill', () => actions.addProfileSkill({ name: 'SQL' }), 'user'],
  ['removeProfileSkill', () => actions.removeProfileSkill({ tagId: 'x' }), 'user'],
  ['suggestSkills', () => actions.suggestSkills({ query: 'sq' }), 'user'],
];

describe('profil içeriği eylemleri', () => {
  it('bütün dışa açık eylemler kapsanır', () => {
    expect(calls.map(([name]) => name).sort()).toEqual(Object.keys(actions).sort());
  });

  it.each(calls)('%s: oturumsuzda servis çağrılmaz', async (_name, call, guard) => {
    const error = codedUnauthenticated('AUTH_UNAUTHENTICATED');
    (guard === 'member' ? mocks.requireVerifiedMember : mocks.requireUser).mockRejectedValue(error);
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
  });

  it('başkasının profili için doğrulanmış üyelik gerekir; kendi profilini düzenlemek için gerekmez', async () => {
    mocks.requireVerifiedMember.mockRejectedValue(codedForbidden('AUTH_NOT_VERIFIED'));
    expect(await actions.getProfile({ userId: 'x' })).toEqual({
      ok: false,
      errorCode: 'AUTH_NOT_VERIFIED',
    });
    mocks.service.addProfileSkill.mockResolvedValue({ ok: 1 });
    expect(await actions.addProfileSkill({ name: 'SQL' })).toEqual({ ok: true, data: { ok: 1 } });
    expect(mocks.requireVerifiedMember).toHaveBeenCalledTimes(1);
  });

  it('geçersiz girdi servise ulaşmaz; kimlik/yetki alanları reddedilir', async () => {
    for (const result of [
      await actions.updateProfileBasics({} as never),
      await actions.setSocialLinks({ links: [{ kind: 'GITHUB', url: 'http://github.com/a' }] }),
      await actions.setSocialLinks({ links: [{ kind: 'GITHUB', url: 'https://evil.example/a' }] }),
      await actions.setLinkedinUrl({ url: 'https://example.com/in/abc' }),
      await actions.saveProfileEntry({
        section: 'LANGUAGE',
        userId: 'baska',
        values: { name: 'x' },
      } as never),
      await actions.getProfile({ userId: '' }),
      await actions.addProfileSkill({ name: '' }),
      await actions.suggestSkills({ query: 'a' }),
    ]) {
      expect(result).toMatchObject({ ok: false });
    }
    expect(
      await actions.setSocialLinks({ links: [{ kind: 'GITHUB', url: 'http://github.com/a' }] }),
    ).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { 'links.0.url': 'PROFILE_LINK_NOT_HTTPS' },
    });
    for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
  });

  it('servise oturumdaki kimlik ve doğrulanmış girdi gider', async () => {
    mocks.service.setSocialLinks.mockResolvedValue({});
    await actions.setSocialLinks({
      links: [{ kind: 'GITHUB', url: 'https://www.github.com/a/?x=1' }],
    });
    const [deps, userId, input] = mocks.service.setSocialLinks.mock.calls[0]!;
    expect(deps).toEqual({ db: { marker: 'db' } });
    expect(userId).toBe('oturum-kullanicisi');
    expect(input).toEqual({ links: [{ kind: 'GITHUB', url: 'https://github.com/a' }] });
    mocks.service.getProfile.mockResolvedValue({ userId: 'hedef' });
    await actions.getProfile({ userId: 'hedef' });
    expect(mocks.service.getProfile.mock.calls[0]!.slice(1)).toEqual([
      'oturum-kullanicisi',
      'hedef',
    ]);
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.service.getMyProfile.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await actions.getMyProfile()).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });
});
