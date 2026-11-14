import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ headers: vi.fn(), getSession: vi.fn(), log: vi.fn() }));
vi.mock('next/headers', () => ({ headers: state.headers }));
vi.mock('../auth', () => ({ getAuth: () => ({ api: { getSession: state.getSession } }) }));
vi.mock('../auth/log', () => ({ logAuthFailure: state.log }));
import { getSessionUserId } from './session';

beforeEach(() => {
  vi.clearAllMocks();
  state.headers.mockResolvedValue(new Headers());
});
describe('getSessionUserId kontrol sinyali', () => {
  it('Next dinamik kullanım sinyalini aynen fırlatır, günlüğe yazmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    state.headers.mockRejectedValue(signal);
    await expect(getSessionUserId()).rejects.toBe(signal);
    expect(state.log).not.toHaveBeenCalled();
  });
  it('gerçek çözümleme hatası fail-closed ve tek günlük', async () => {
    const error = new Error('synthetic');
    state.getSession.mockRejectedValue(error);
    await expect(getSessionUserId()).resolves.toBeNull();
    expect(state.log).toHaveBeenCalledOnce();
    expect(state.log).toHaveBeenCalledWith('getSession', error);
  });
});
