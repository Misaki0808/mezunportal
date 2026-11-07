import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isCodedError } from '@/lib/errors';

const state = vi.hoisted(() => ({
  headers: new Headers(),
  getSession: vi.fn(),
  getAuthThrows: false,
}));

vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('../auth', () => ({
  getAuth: () => {
    if (state.getAuthThrows) throw new Error('yapılandırma eksik');
    return { api: { getSession: state.getSession } };
  },
}));
vi.mock('../auth/log', () => ({ logAuthFailure: vi.fn() }));
vi.mock('../db', () => ({ getDb: () => ({}) }));

import {
  requireAdmin,
  requireMentor,
  requireModerator,
  requireUser,
  requireVerifiedMember,
} from './index';
import { getSessionUserId } from './session';

beforeEach(() => {
  state.headers = new Headers();
  state.getSession.mockReset();
  state.getAuthThrows = false;
});

// Varsayılan korumalar Better Auth oturumuna bağlıdır; oturum çözülemeyen HER durumda FAIL-CLOSED:
// kimse geçirilmez (veritabanına bile gidilmeden AUTH_UNAUTHENTICATED).
describe('getSessionUserId (oturum bağlantısı)', () => {
  it('geçerli oturumun kullanıcı kimliğini döner', async () => {
    state.getSession.mockResolvedValue({ user: { id: 'u1' }, session: {} });
    expect(await getSessionUserId()).toBe('u1');
  });

  it('çerezdeki oturumu Better Auth’a istek başlıklarıyla sorar (kimlik istemci girdisinden değil)', async () => {
    state.headers = new Headers({ cookie: 'mezun.session_token=abc' });
    state.getSession.mockResolvedValue(null);
    await getSessionUserId();
    expect(state.getSession).toHaveBeenCalledWith({ headers: state.headers });
  });

  it.each([
    ['oturum yok', () => state.getSession.mockResolvedValue(null)],
    ['oturumda kullanıcı yok', () => state.getSession.mockResolvedValue({ session: {} })],
    [
      'çözümleme hata verir',
      () => state.getSession.mockRejectedValue(new Error('veritabanı kapalı')),
    ],
    [
      'yapılandırma eksik',
      () => {
        state.getAuthThrows = true;
      },
    ],
  ])('%s → null (oturumsuz)', async (_label, arrange) => {
    arrange();
    expect(await getSessionUserId()).toBeNull();
  });
});

describe('varsayılan korumalar (oturum yokken)', () => {
  it.each([
    ['requireUser', () => requireUser()],
    ['requireVerifiedMember', () => requireVerifiedMember()],
    ['requireMentor', () => requireMentor()],
    ['requireAdmin(SYSTEM)', () => requireAdmin({ kind: 'SYSTEM' })],
    ['requireModerator', () => requireModerator('herhangi-bir-bolum')],
  ])('%s → AUTH_UNAUTHENTICATED (401)', async (_name, guard) => {
    state.getSession.mockResolvedValue(null);
    const error = await guard().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isCodedError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'AUTH_UNAUTHENTICATED', status: 401 });
  });
});
