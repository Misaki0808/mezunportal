import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireAnyAdmin: vi.fn(),
  requireMentor: vi.fn(),
  requireVerifiedMember: vi.fn(),
  faq: {
    suggestSimilarFaqs: vi.fn(),
    submitFaqRequest: vi.fn(),
    listMyFaqRequests: vi.fn(),
    listFaqRequestsForMentor: vi.fn(),
    answerFaqRequest: vi.fn(),
    searchFaq: vi.fn(),
    getFaqItem: vi.fn(),
  },
  moderation: {
    listFaqModerationQueue: vi.fn(),
    publishFaq: vi.fn(),
    rejectFaq: vi.fn(),
    redirectFaq: vi.fn(),
  },
}));
vi.mock('../permissions', () => ({
  requireAnyAdmin: mocks.requireAnyAdmin,
  requireMentor: mocks.requireMentor,
  requireVerifiedMember: mocks.requireVerifiedMember,
}));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/faq', () => mocks.faq);
vi.mock('../services/faq-moderation', () => mocks.moderation);

import * as actions from './faq';

const long = 'Yaz stajı başvurusunda hangi belgeler gerekir';
const answer = 'Özgeçmiş, transkript ve başvuru formu genellikle yeterli olur.';
beforeEach(() => {
  mocks.requireAnyAdmin.mockReset().mockResolvedValue({ userId: 'oturum-moderator' });
  mocks.requireMentor.mockReset().mockResolvedValue({ userId: 'oturum-mentor' });
  mocks.requireVerifiedMember.mockReset().mockResolvedValue({ userId: 'oturum-uye' });
  for (const fn of [...Object.values(mocks.faq), ...Object.values(mocks.moderation)])
    fn.mockReset().mockResolvedValue({ sonuc: 1 });
});

const cases = [
  [
    'suggestSimilarFaqs',
    () => actions.suggestSimilarFaqs({ text: long }),
    'requireVerifiedMember',
    mocks.faq.suggestSimilarFaqs,
    'oturum-uye',
  ],
  [
    'submitFaqRequest',
    () => actions.submitFaqRequest({ question: long }),
    'requireVerifiedMember',
    mocks.faq.submitFaqRequest,
    'oturum-uye',
  ],
  [
    'listMyFaqRequests',
    () => actions.listMyFaqRequests(),
    'requireVerifiedMember',
    mocks.faq.listMyFaqRequests,
    'oturum-uye',
  ],
  [
    'listFaqRequestsForMentor',
    () => actions.listFaqRequestsForMentor(),
    'requireMentor',
    mocks.faq.listFaqRequestsForMentor,
    'oturum-mentor',
  ],
  [
    'answerFaqRequest',
    () => actions.answerFaqRequest({ requestId: 'r1', body: answer }),
    'requireMentor',
    mocks.faq.answerFaqRequest,
    'oturum-mentor',
  ],
  [
    'listFaqModerationQueue',
    () => actions.listFaqModerationQueue(),
    'requireAnyAdmin',
    mocks.moderation.listFaqModerationQueue,
    'oturum-moderator',
  ],
  [
    'publishFaq',
    () => actions.publishFaq({ requestId: 'r1', selectedAnswerId: 'a1', question: long, answer }),
    'requireAnyAdmin',
    mocks.moderation.publishFaq,
    'oturum-moderator',
  ],
  [
    'rejectFaq',
    () => actions.rejectFaq({ requestId: 'r1', reason: 'Tekrar soru' }),
    'requireAnyAdmin',
    mocks.moderation.rejectFaq,
    'oturum-moderator',
  ],
  [
    'redirectFaq',
    () => actions.redirectFaq({ requestId: 'r1', note: 'Mentora yönlendir' }),
    'requireAnyAdmin',
    mocks.moderation.redirectFaq,
    'oturum-moderator',
  ],
  [
    'searchFaq',
    () => actions.searchFaq(),
    'requireVerifiedMember',
    mocks.faq.searchFaq,
    'oturum-uye',
  ],
  [
    'getFaqItem',
    () => actions.getFaqItem({ id: 'i1' }),
    'requireVerifiedMember',
    mocks.faq.getFaqItem,
    'oturum-uye',
  ],
] as const;

describe('SSS eylemleri', () => {
  it.each(cases)(
    '%s: kimlik oturumdan gelir, servis çağrılır',
    async (_n, call, _g, service, userId) => {
      expect(await call()).toEqual({ ok: true, data: { sonuc: 1 } });
      expect(service.mock.calls[0]![1]).toBe(userId);
      expect(service.mock.calls[0]![0]).toMatchObject({ db: { marker: 'db' } });
    },
  );

  it.each(cases)('%s: koruma reddederse servis çağrılmaz', async (_n, call, guard, service) => {
    mocks[guard].mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    mocks[guard].mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    expect(service).not.toHaveBeenCalled();
  });

  it('öğrenci eylemleri öğrenci rolünü ister', async () => {
    await actions.submitFaqRequest({ question: long });
    await actions.listMyFaqRequests();
    await actions.suggestSimilarFaqs({ text: long });
    expect(mocks.requireVerifiedMember).toHaveBeenCalledTimes(3);
    for (const call of mocks.requireVerifiedMember.mock.calls)
      expect(call[0]).toEqual({ roles: ['STUDENT'] });
    mocks.requireVerifiedMember.mockClear();
    await actions.searchFaq();
    expect(mocks.requireVerifiedMember.mock.calls[0]).toEqual([]);
  });

  it('geçersiz girdi ve istemciden gelen kimlik alanları servise ulaşmaz', async () => {
    for (const bad of [
      () => actions.submitFaqRequest({ question: 'kısa' }),
      () => actions.submitFaqRequest({ question: long, askerId: 'baska' } as never),
      () => actions.answerFaqRequest({ requestId: 'r', body: 'kısa' }),
      () => actions.answerFaqRequest({ requestId: 'r', body: answer, mentorId: 'baska' } as never),
      () =>
        actions.publishFaq({
          requestId: 'r',
          selectedAnswerId: 'a',
          question: long,
          answer,
          publishedById: 'x',
        } as never),
      () => actions.rejectFaq({ requestId: 'r', reason: '' }),
      () => actions.searchFaq({ q: 'a' }),
    ])
      expect(await bad()).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    for (const fn of [...Object.values(mocks.faq), ...Object.values(mocks.moderation)])
      expect(fn).not.toHaveBeenCalled();
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.faq.searchFaq.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await actions.searchFaq()).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });
});
