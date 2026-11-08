import { beforeEach, expect, it, vi } from 'vitest';
import { codedUnauthenticated, codedForbidden } from '@/lib/errors';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  db: vi.fn(),
  consent: vi.fn(),
  view: vi.fn(),
  submit: vi.fn(),
  reliability: vi.fn(),
  overview: vi.fn(),
}));
vi.mock('../permissions', () => ({ requireVerifiedMember: mocks.actor }));
vi.mock('../db', () => ({ getDb: mocks.db }));
vi.mock('../services/privacy', () => ({ requireConsent: mocks.consent }));
vi.mock('../services/feedback', () => ({
  feedbackView: mocks.view,
  submitFeedback: mocks.submit,
  studentReliability: mocks.reliability,
  feedbackOverview: mocks.overview,
}));
import {
  getFeedbackView,
  submitSessionFeedback,
  getMyReliability,
  getFeedbackOverview,
} from './feedback';
const input = { appointmentId: 'meeting', happened: true, helpful: true, note: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    userId: 'session',
    facts: { memberships: [{ role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: null }] },
  });
  mocks.db.mockReturnValue({ marker: 'db' });
  mocks.consent.mockResolvedValue(undefined);
  mocks.reliability.mockResolvedValue({ label: 'NEW', total: 0, completed: 0, noShow: 0 });
});
it.each(['anonymous', 'suspended'])(
  'inceleyici: %s kullanıcıda eylemler veri servisine ulaşmaz',
  async (kind) => {
    mocks.actor.mockRejectedValue(
      kind === 'anonymous'
        ? codedUnauthenticated('AUTH_UNAUTHENTICATED')
        : codedForbidden('AUTH_ACCOUNT_SUSPENDED'),
    );
    for (const call of [
      () => getFeedbackView('meeting'),
      () => submitSessionFeedback(input),
      () => getMyReliability(),
      () => getFeedbackOverview(),
    ])
      expect(await call()).toMatchObject({
        ok: false,
        errorCode: kind === 'anonymous' ? 'AUTH_UNAUTHENTICATED' : 'AUTH_ACCOUNT_SUSPENDED',
      });
    expect(mocks.db).not.toHaveBeenCalled();
  },
);
it('inceleyici: gösterge kimliği oturumdan gelir, öğrenci olmayan veya bitmiş üyelik reddedilir', async () => {
  await getMyReliability();
  expect(mocks.reliability).toHaveBeenCalledWith({ marker: 'db' }, 'session', 'session');
  mocks.reliability.mockClear();
  for (const membership of [
    { role: 'ALUMNI', verificationStatus: 'VERIFIED', endedAt: null },
    { role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: new Date() },
  ]) {
    mocks.actor.mockResolvedValue({ userId: 'other', facts: { memberships: [membership] } });
    expect(await getMyReliability()).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
  }
  expect(mocks.reliability).not.toHaveBeenCalled();
});

it('yanlış kimlik türü yetkiden sonra doğrulama hatasıdır', async () => {
  expect(await getFeedbackView({} as unknown as string)).toMatchObject({
    ok: false,
    errorCode: 'VALIDATION_INVALID',
  });
  expect(mocks.view).not.toHaveBeenCalled();
  mocks.actor.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
  expect(await getFeedbackView({} as unknown as string)).toMatchObject({
    ok: false,
    errorCode: 'AUTH_UNAUTHENTICATED',
  });
});
