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
import { requirePageVerifiedMember, requireVerifiedMember } from './index';
import { guardPage } from './page-guard';
import { hasAdminAccessStrict } from '@/components/layout/admin-access';
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
