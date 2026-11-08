import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codedForbidden } from '@/lib/errors';
import { SEEKER_ACTION_ACCESS } from '@/contracts/job-seekers';
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  service: {
    getMySeekerSettings: vi.fn(),
    setSeekerSettings: vi.fn(),
    getMyHiringDeclaration: vi.fn(),
    setHiringDeclaration: vi.fn(),
    searchSeekers: vi.fn(),
    previewSeekerContact: vi.fn(),
    requestSeekerContact: vi.fn(),
  },
}));
vi.mock('../permissions', () => ({ requireVerifiedMember: mocks.guard }));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/job-seekers', () => mocks.service);
import * as actions from './job-seekers';
const ref = 'b8b71873-1b88-4f19-804f-9cc735892193';
const cases = [
  ['getMySeekerSettings', () => actions.getMySeekerSettings(), 'STUDENT'],
  ['setSeekerSettings', () => actions.setSeekerSettings({ seekingInternship: false }), 'STUDENT'],
  ['getMyHiringDeclaration', () => actions.getMyHiringDeclaration(), 'ALUMNI'],
  ['setHiringDeclaration', () => actions.setHiringDeclaration({ hiring: true }), 'ALUMNI'],
  ['searchSeekers', () => actions.searchSeekers(), 'ALUMNI'],
  ['previewSeekerContact', () => actions.previewSeekerContact({ ref }), 'ALUMNI'],
  [
    'requestSeekerContact',
    () => actions.requestSeekerContact({ ref, fields: ['EMAIL'] }),
    'ALUMNI',
  ],
] as const;
beforeEach(() => {
  mocks.guard.mockReset().mockResolvedValue({ userId: 'current-user' });
  for (const fn of Object.values(mocks.service)) fn.mockReset().mockResolvedValue({ value: 1 });
});
describe('aday eylemleri', () => {
  it('eylem kataloğunun tamamı sınanır', () =>
    expect(cases.map((x) => x[0]).sort()).toEqual(Object.keys(SEEKER_ACTION_ACCESS).sort()));
  it.each(cases)(
    '%s oturum ve rol kapısından geçer, kullanıcı kimliğini sunucudan alır',
    async (name, call, role) => {
      expect(await call()).toEqual({ ok: true, data: { value: 1 } });
      expect(mocks.guard).toHaveBeenCalledWith({ roles: [role] });
      expect(mocks.service[name]).toHaveBeenCalledWith(
        { db: { marker: 'db' } },
        'current-user',
        expect.any(Object),
      );
    },
  );
  it.each(cases)('%s erişim reddinde servise gitmez', async (name, call) => {
    mocks.guard.mockRejectedValue(codedForbidden('AUTH_FORBIDDEN'));
    expect(await call()).toMatchObject({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    expect(mocks.service[name]).not.toHaveBeenCalled();
  });
  it('geçersiz girdi servise ulaşmaz', async () => {
    expect(
      await actions.setSeekerSettings({ seekingInternship: true, termYear: 2030 }),
    ).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(mocks.service.setSeekerSettings).not.toHaveBeenCalled();
    expect(await actions.requestSeekerContact({ ref: 'invalid', fields: ['EMAIL'] })).toMatchObject(
      { ok: false },
    );
    expect(mocks.service.requestSeekerContact).not.toHaveBeenCalled();
  });
});
