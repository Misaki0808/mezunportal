import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated, codedValidation } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOnboardingState: vi.fn(),
  listProfileTags: vi.fn(),
  saveOnboardingStep: vi.fn(),
  skipOnboardingStep: vi.fn(),
}));
vi.mock('../permissions', () => ({ requireUser: mocks.requireUser }));
vi.mock('../db', () => ({ getDb: () => ({}) }));
vi.mock('../services/profile', () => ({
  getOnboardingState: mocks.getOnboardingState,
  listProfileTags: mocks.listProfileTags,
  saveOnboardingStep: mocks.saveOnboardingStep,
  skipOnboardingStep: mocks.skipOnboardingStep,
}));
import {
  getOnboardingState,
  listProfileTags,
  saveOnboardingStep,
  skipOnboardingStep,
} from './profile';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireUser.mockResolvedValue({ userId: 'session-user' });
});
const calls = [
  ['getOnboardingState', () => getOnboardingState()],
  ['listProfileTags', () => listProfileTags({ kind: 'INTEREST' })],
  ['saveOnboardingStep', () => saveOnboardingStep({ step: 'COMPLETE' })],
  ['skipOnboardingStep', () => skipOnboardingStep({ step: 'GOALS' })],
] as const;

describe('profil eylemleri', () => {
  it.each(calls)('%s oturum olmadan kodlu yanıt döner, servisi çağırmaz', async (_name, call) => {
    mocks.requireUser.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    for (const [name] of calls) expect(mocks[name]).not.toHaveBeenCalled();
  });
  it.each(calls)('%s askıdaki hesaba kapalıdır', async (_name, call) => {
    mocks.requireUser.mockRejectedValue(codedForbidden('AUTH_ACCOUNT_SUSPENDED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_ACCOUNT_SUSPENDED' });
  });
  it('geçersiz, zorunlu atlama ve boş/çift seçim servise ulaşmaz', async () => {
    for (const input of [
      { step: 'INTERESTS', tagIds: [] },
      { step: 'GOALS', tagIds: ['a', 'a'] },
      { step: 'MENTOR_PREFERENCE', interested: 'true' },
    ]) {
      expect(await saveOnboardingStep(input as never)).toMatchObject({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
      });
    }
    for (const step of ['MEMBERSHIP', 'COMPLETE']) {
      expect(await skipOnboardingStep({ step } as never)).toMatchObject({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
      });
    }
    expect(await listProfileTags({ kind: 'FAKE' } as never)).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
    });
    expect(mocks.saveOnboardingStep).not.toHaveBeenCalled();
    expect(mocks.skipOnboardingStep).not.toHaveBeenCalled();
    expect(mocks.listProfileTags).not.toHaveBeenCalled();
  });
  it('istemcinin userId/rol/sınıf/deneyim sayısı atılır, kimlik yalnız oturumdan gelir', async () => {
    mocks.saveOnboardingStep.mockResolvedValue({ step: 'VISIBILITY' });
    expect(
      await saveOnboardingStep({
        step: 'MENTOR_PREFERENCE',
        interested: true,
        userId: 'other',
        role: 'ALUMNI',
        grade: 4,
        publishedExperienceCount: 99,
      } as never),
    ).toEqual({ ok: true, data: { step: 'VISIBILITY' } });
    expect(mocks.saveOnboardingStep).toHaveBeenCalledWith(expect.anything(), 'session-user', {
      step: 'MENTOR_PREFERENCE',
      interested: true,
    });
    await skipOnboardingStep({ step: 'GOALS', userId: 'other' } as never);
    expect(mocks.skipOnboardingStep).toHaveBeenCalledWith(expect.anything(), 'session-user', {
      step: 'GOALS',
    });
    await getOnboardingState();
    expect(mocks.getOnboardingState).toHaveBeenCalledWith(expect.anything(), 'session-user');
    await listProfileTags({ kind: 'GOAL', userId: 'other' } as never);
    expect(mocks.listProfileTags).toHaveBeenCalledWith(expect.anything(), 'session-user', {
      kind: 'GOAL',
    });
  });
  it('iş kuralı hata kodu korunur, beklenmeyen hata ayrıntıları dışarı çıkmaz', async () => {
    mocks.saveOnboardingStep.mockRejectedValue(codedValidation('MENTOR_NOT_ELIGIBLE'));
    expect(await saveOnboardingStep({ step: 'MENTOR_PREFERENCE', interested: true })).toEqual({
      ok: false,
      errorCode: 'MENTOR_NOT_ELIGIBLE',
    });
    mocks.getOnboardingState.mockRejectedValue(new Error('postgres://secret-token'));
    expect(await getOnboardingState()).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });
});
