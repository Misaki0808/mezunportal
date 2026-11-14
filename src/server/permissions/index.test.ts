import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isCodedError } from '@/lib/errors';

const state = vi.hoisted(() => ({
  headers: new Headers(),
  getSession: vi.fn(),
  getAuthThrows: false,
  db: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('../auth', () => ({
  getAuth: () => {
    if (state.getAuthThrows) throw new Error('yapılandırma eksik');
    return { api: { getSession: state.getSession } };
  },
}));
vi.mock('../auth/log', () => ({ logAuthFailure: vi.fn() }));
vi.mock('../db', () => ({ getDb: state.db }));

import {
  requireAdmin,
  requireMentor,
  requireModerator,
  requireUser,
  requireUserWithoutConsent,
  requireVerifiedMember,
} from './index';
import { getSessionUserId } from './session';
import { failAction } from '../fail-action';

beforeEach(() => {
  state.headers = new Headers({ cookie: 'mezun.session_token=abc' });
  state.getSession.mockReset();
  state.getAuthThrows = false;
  state.db.mockReset();
});

// Better Auth kimliği çözemediğinde kimse geçirilmez; gerçek boş oturum ve altyapı hatası ayrılır.
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

  it('çerez yoksa DB oturumu sorgulanmaz', async () => {
    state.headers = new Headers();
    state.getAuthThrows = true;
    expect(await getSessionUserId()).toBeNull();
    expect(state.getSession).not.toHaveBeenCalled();
  });
  it.each(['mezun.session_token=abc', '__Secure-mezun.session_token=abc'])(
    '%s geçersiz oturum → null',
    async (cookie) => {
      state.headers = new Headers({ cookie });
      state.getSession.mockResolvedValue(null);
      expect(await getSessionUserId()).toBeNull();
    },
  );
  it('kullanıcısız oturum güvenle null döner', async () => {
    state.getSession.mockResolvedValue({ session: {} });
    expect(await getSessionUserId()).toBeNull();
  });
  it('çerez varken altyapı hatası null yapılmaz', async () => {
    const error = new Error('sentetik');
    state.getSession.mockRejectedValue(error);
    await expect(getSessionUserId()).rejects.toBe(error);
  });
  it('çerez varken yapılandırma hatası yutulmaz', async () => {
    state.getAuthThrows = true;
    await expect(getSessionUserId()).rejects.toThrow('yapılandırma eksik');
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

it('oturum altyapısı bozulunca eylem geçici hata döndürür ve aktör/veri sorgusu yapmaz', async () => {
  state.getSession.mockRejectedValue(new Error('gizli sentetik bilgi'));
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const result = await requireUserWithoutConsent().catch((error: unknown) =>
      failAction(error, 'sessionTest'),
    );
    expect(result).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    expect(state.db).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();
    expect(String(write.mock.calls[0]?.[0])).not.toContain('gizli');
  } finally {
    write.mockRestore();
  }
});
