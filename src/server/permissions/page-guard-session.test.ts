import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  authLog: vi.fn(),
  db: vi.fn(),
  consent: vi.fn(),
  content: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'mezun.session_token=abc' }),
}));
vi.mock('../auth', () => ({ getAuth: () => ({ api: { getSession: state.session } }) }));
vi.mock('../auth/log', () => ({ logAuthFailure: state.authLog }));
vi.mock('../db', () => ({ getDb: state.db }));
vi.mock('../services/privacy', () => ({ requireConsent: state.consent }));
vi.mock('@/server/actions/cv-review-request', () => ({
  listCvReviewRequests: state.content,
  getCvReviewSettings: state.content,
}));
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
  await expect(requireVerifiedMember()).rejects.toThrow('private');
  expect(state.authLog).not.toHaveBeenCalled();
  expect(state.db).not.toHaveBeenCalled();
});
it('gerçek boş oturum sayfada kodlu ret ve günlük yoktur', async () => {
  state.session.mockResolvedValue(null);
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    expect(await guardPage('page.test', () => requirePageVerifiedMember())).toEqual({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
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
        errorCode: 'CONSENT_REQUIRED',
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

it.each([
  ['üyelik yok', { ...member, memberships: [] }, 'AUTH_NOT_VERIFIED'],
  [
    'bekleyen üyelik',
    { ...member, memberships: [{ ...member.memberships[0], verificationStatus: 'PENDING' }] },
    'AUTH_NOT_VERIFIED',
  ],
  ['askıda hesap', { ...member, banned: true }, 'AUTH_ACCOUNT_SUSPENDED'],
  ['silinmiş hesap', { ...member, deletedAt: new Date() }, 'AUTH_UNAUTHENTICATED'],
  ['bulunmayan hesap', null, 'AUTH_UNAUTHENTICATED'],
] as const)(
  '%s: gerçek izin zinciri ret nedenini korur ve içerik sorgulamaz',
  async (_name, user, code) => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      signedIn(user);
      expect(await guardPage('page.test', () => requirePageVerifiedMember())).toEqual({
        ok: false,
        errorCode: code,
      });
      expect(state.consent).not.toHaveBeenCalled();
      expect(state.content).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  },
);

it('aktif üyelik başka roldeyse rol reddi korunur', async () => {
  signedIn();
  expect(
    await guardPage('page.test', () => requirePageVerifiedMember({ roles: ['ALUMNI'] })),
  ).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  expect(state.consent).not.toHaveBeenCalled();
});

it('350 B1: açık oturum, sonlandırılmış üyelik; gerçek CV sayfası giriş değil üyelik mesajı ve içerik yok', async () => {
  signedIn({ ...member, memberships: [{ ...member.memberships[0], endedAt: new Date() }] });
  const page = (await import('@/app/(kimlik)/hesap/cv-inceleme/page')).default;
  const result = await page();
  expect(result).toMatchObject({ props: { errorCode: 'AUTH_NOT_VERIFIED' } });
  expect(state.session).toHaveBeenCalled();
  expect(state.consent).not.toHaveBeenCalled();
  expect(state.content).not.toHaveBeenCalled();
});
