import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  authLog: vi.fn(),
  db: vi.fn(),
  consent: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../auth', () => ({ getAuth: () => ({ api: { getSession: state.session } }) }));
vi.mock('../auth/log', () => ({ logAuthFailure: state.authLog }));
vi.mock('../db', () => ({ getDb: state.db }));
vi.mock('../services/privacy', () => ({ requireConsent: state.consent }));
import { requirePageAnyAdmin, requirePageVerifiedMember, requireVerifiedMember } from './index';
import { guardPage } from './page-guard';
import { hasAdminAccessStrict } from '@/components/layout/admin-access';
import { codedForbidden } from '@/lib/errors';
beforeEach(() => {
  vi.resetAllMocks();
});
it('sayfa kapısında gerçek oturum altyapı hatası genel hata ve tek güvenli günlüktür', async () => {
  const error = new Error('ayse@example.test private');
  state.session.mockRejectedValue(error);
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    expect(await guardPage('page.test', () => requirePageVerifiedMember())).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
    expect(write).toHaveBeenCalledOnce();
    const line = String(write.mock.calls[0]![0]);
    expect(JSON.parse(line)).toMatchObject({
      event: 'route.unexpected',
      source: 'page.test',
      errorName: 'Error',
    });
    expect(line).not.toMatch(/ayse|private/);
    expect(state.authLog).not.toHaveBeenCalled();
    expect(state.db).not.toHaveBeenCalled();
    expect(state.consent).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
it('yönetim sayfası kapısında oturum altyapı hatası da genel hatadır', async () => {
  state.session.mockRejectedValue(new Error('private'));
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    expect(await guardPage('admin.access', hasAdminAccessStrict)).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
    expect(write).toHaveBeenCalledOnce();
    expect(state.authLog).not.toHaveBeenCalled();
    expect(state.db).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
it('mevcut sayfa dışı koruma gerçek oturum hatasında yine fail-closed kalır', async () => {
  state.session.mockRejectedValue(new Error('private'));
  await expect(requireVerifiedMember()).rejects.toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
  expect(state.authLog).toHaveBeenCalledOnce();
  expect(state.db).not.toHaveBeenCalled();
});
it('gerçek boş oturum sayfada kodlu ret ve günlük yoktur', async () => {
  state.session.mockResolvedValue(null);
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    expect(await guardPage('page.test', () => requirePageVerifiedMember())).toEqual({
      ok: false,
      errorCode: 'AUTH_FORBIDDEN',
    });
    expect(write).not.toHaveBeenCalled();
    expect(state.authLog).not.toHaveBeenCalled();
    expect(state.db).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
const member = {
  id: 'u1',
  banned: false,
  banExpires: null,
  deletedAt: null,
  memberships: [
    {
      id: 'm1',
      departmentId: 'd1',
      role: 'STUDENT',
      verificationStatus: 'VERIFIED',
      endedAt: null,
    },
  ],
  adminGrants: [
    { id: 'g1', scope: 'SYSTEM', facultyId: null, departmentId: null, revokedAt: null },
  ],
  mentorProfile: null,
};
const signedIn = (user: unknown = member) => {
  state.session.mockResolvedValue({ user: { id: 'u1' } });
  state.db.mockReturnValue({ user: { findUnique: async () => user } });
};
it.each([
  ['requirePageVerifiedMember', () => requirePageVerifiedMember()],
  ['requirePageAnyAdmin', () => requirePageAnyAdmin()],
])(
  '%s: sayfa varyantı da rıza denetimini uygular (eksik rıza kodlu ret, rıza DB hatası genel hata)',
  async (_name, call) => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      signedIn();
      state.consent.mockResolvedValue(undefined);
      expect(await guardPage('page.test', call)).toMatchObject({ ok: true });
      expect(state.consent).toHaveBeenCalledOnce();
      state.consent.mockReset();
      state.consent.mockRejectedValue(codedForbidden('CONSENT_REQUIRED'));
      expect(await guardPage('page.test', call)).toEqual({
        ok: false,
        errorCode: 'AUTH_FORBIDDEN',
      });
      expect(state.consent).toHaveBeenCalledOnce();
      expect(write).not.toHaveBeenCalled();
      state.consent.mockReset();
      state.consent.mockRejectedValue(new Error('ayse@example.test private'));
      expect(await guardPage('page.test', call)).toEqual({
        ok: false,
        errorCode: 'SERVER_UNEXPECTED',
      });
      expect(write).toHaveBeenCalledOnce();
      expect(String(write.mock.calls[0]![0])).not.toMatch(/ayse|private/);
    } finally {
      write.mockRestore();
    }
  },
);
it('hasAdminAccessStrict: doğrulanmış ama yönetici olmayan üye için false, yönetici için true', async () => {
  state.consent.mockResolvedValue(undefined);
  signedIn({ ...member, adminGrants: [] });
  expect(await guardPage('admin.access', hasAdminAccessStrict)).toEqual({ ok: true, value: false });
  signedIn();
  expect(await guardPage('admin.access', hasAdminAccessStrict)).toEqual({ ok: true, value: true });
});
