import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ headers: vi.fn(), getSession: vi.fn(), log: vi.fn() }));
vi.mock('next/headers', () => ({ headers: state.headers }));
vi.mock('../auth', () => ({ getAuth: () => ({ api: { getSession: state.getSession } }) }));
vi.mock('../auth/log', () => ({ logAuthFailure: state.log }));
import { getSessionUserId } from './session';

beforeEach(() => {
  vi.clearAllMocks();
  state.headers.mockResolvedValue(new Headers({ cookie: 'mezun.session_token=abc' }));
});
describe('getSessionUserId kontrol sinyali', () => {
  it('Next dinamik kullanım sinyalini aynen fırlatır, günlüğe yazmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    state.headers.mockRejectedValue(signal);
    await expect(getSessionUserId()).rejects.toBe(signal);
    expect(state.log).not.toHaveBeenCalled();
  });
  it('istek kapsamı yoksa oturumsuz, diğer başlık hatalarında fail-closed kalır', async () => {
    state.headers.mockRejectedValue(
      new Error(
        '`headers` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context',
      ),
    );
    await expect(getSessionUserId()).resolves.toBeNull();
    expect(state.getSession).not.toHaveBeenCalled();
    const failure = new Error('başlıklar okunamadı');
    state.headers.mockRejectedValue(failure);
    await expect(getSessionUserId()).rejects.toBe(failure);
  });
  it('oturum çözümündeki Next kontrol sinyalini de aynen fırlatır', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    state.getSession.mockRejectedValue(signal);
    await expect(getSessionUserId()).rejects.toBe(signal);
    expect(state.log).not.toHaveBeenCalled();
  });
  it('gerçek çözümleme hatası çağırana aktarılır', async () => {
    const error = new Error('synthetic');
    state.getSession.mockRejectedValue(error);
    await expect(getSessionUserId()).rejects.toBe(error);
    expect(state.log).not.toHaveBeenCalled();
  });
});
