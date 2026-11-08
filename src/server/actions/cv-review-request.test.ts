import { beforeEach, expect, it, vi } from 'vitest';
import { codedUnauthenticated } from '@/lib/errors';
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  getAvailability: vi.fn(),
  createRequest: vi.fn(),
  answerRequest: vi.fn(),
  markHelpful: vi.fn(),
  listRequests: vi.fn(),
}));
vi.mock('../permissions', () => ({ requireVerifiedMember: mocks.guard }));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../external/storage', () => ({ getStorage: () => ({ marker: 'storage' }) }));
vi.mock('../services/cv-review-notifier', () => ({ createCvReviewNotifier: () => vi.fn() }));
vi.mock('../services/cv-review-request', () => mocks);
import * as actions from './cv-review-request';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ userId: 'session-user' });
  for (const key of [
    'getSettings',
    'saveSettings',
    'getAvailability',
    'createRequest',
    'answerRequest',
    'markHelpful',
    'listRequests',
  ] as const)
    mocks[key].mockResolvedValue(null);
});
const cases = [
  ['getSettings', () => actions.getCvReviewSettings()],
  ['saveSettings', () => actions.saveCvReviewSettings({ enabled: true, monthlyLimit: 3 })],
  ['getAvailability', () => actions.getCvReviewAvailability({ mentorId: 'mentor' })],
  ['createRequest', () => actions.createCvReviewRequest({ mentorId: 'mentor', note: 'Not' })],
  [
    'answerRequest',
    () => actions.answerCvReviewRequest({ requestId: 'request', comment: 'Yanıt' }),
  ],
  ['markHelpful', () => actions.markCvReviewHelpful({ requestId: 'request' })],
  ['listRequests', () => actions.listCvReviewRequests({ role: 'STUDENT' })],
] as const;
it.each(cases)('inceleyici: %s oturumsuz istekte servise ulaşmaz', async (name, call) => {
  mocks.guard.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
  expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
  expect(mocks[name]).not.toHaveBeenCalled();
});
it.each(cases)('inceleyici: %s kimliği yalnız oturumdan alır', async (name, call) => {
  expect(await call()).toEqual({ ok: true, data: null });
  expect(mocks[name].mock.calls[0]?.[1]).toBe('session-user');
});
it('inceleyici: rol/kimlik ekleme ve boş yorum gibi geçersiz girdiler yazma servisine gitmez', async () => {
  const invalid = [
    actions.createCvReviewRequest({
      mentorId: 'mentor',
      note: 'Not',
      studentId: 'attacker',
    } as never),
    actions.answerCvReviewRequest({ requestId: 'request', comment: '   ' }),
    actions.saveCvReviewSettings({ enabled: true, monthlyLimit: 101 }),
    actions.markCvReviewHelpful({ requestId: 'request', userId: 'other' } as never),
  ];
  for (const result of await Promise.all(invalid))
    expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
  expect(mocks.createRequest).not.toHaveBeenCalled();
  expect(mocks.answerRequest).not.toHaveBeenCalled();
  expect(mocks.saveSettings).not.toHaveBeenCalled();
  expect(mocks.markHelpful).not.toHaveBeenCalled();
});
