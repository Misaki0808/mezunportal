import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireAnyAdmin: vi.fn(),
  requireVerifiedMember: vi.fn(),
  posting: {
    getJobPostingFormContext: vi.fn(),
    saveJobPostingDraft: vi.fn(),
    submitJobPosting: vi.fn(),
    closeJobPosting: vi.fn(),
    listMyJobPostings: vi.fn(),
    searchJobPostings: vi.fn(),
    getJobPostingFilterOptions: vi.fn(),
    getJobPosting: vi.fn(),
    reportJobPosting: vi.fn(),
  },
  moderation: {
    listJobPostingModerationQueue: vi.fn(),
    reviewJobPosting: vi.fn(),
    listJobPostingReports: vi.fn(),
    resolveJobPostingReport: vi.fn(),
  },
}));
vi.mock('../permissions', () => ({
  requireAnyAdmin: mocks.requireAnyAdmin,
  requireVerifiedMember: mocks.requireVerifiedMember,
}));
vi.mock('../db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('../services/job-postings', () => mocks.posting);
vi.mock('../services/job-posting-moderation', () => mocks.moderation);

import { JOB_POSTING_ACTION_ACCESS } from '@/contracts/job-postings';

import * as actions from './job-postings';

const draftContent = { title: 'Veri analisti stajyeri' };
beforeEach(() => {
  mocks.requireAnyAdmin.mockReset().mockResolvedValue({ userId: 'oturum-moderator' });
  mocks.requireVerifiedMember.mockReset().mockResolvedValue({ userId: 'oturum-uye' });
  for (const fn of [...Object.values(mocks.posting), ...Object.values(mocks.moderation)])
    fn.mockReset().mockResolvedValue({ sonuc: 1 });
});

const member = 'requireVerifiedMember' as const;
const admin = 'requireAnyAdmin' as const;
const cases = [
  [
    'getJobPostingFormContext',
    () => actions.getJobPostingFormContext(),
    member,
    mocks.posting.getJobPostingFormContext,
    'oturum-uye',
  ],
  [
    'saveJobPostingDraft',
    () => actions.saveJobPostingDraft({ departmentId: 'd1', content: draftContent }),
    member,
    mocks.posting.saveJobPostingDraft,
    'oturum-uye',
  ],
  [
    'submitJobPosting',
    () => actions.submitJobPosting({ postingId: 'p1' }),
    member,
    mocks.posting.submitJobPosting,
    'oturum-uye',
  ],
  [
    'closeJobPosting',
    () => actions.closeJobPosting({ postingId: 'p1' }),
    member,
    mocks.posting.closeJobPosting,
    'oturum-uye',
  ],
  [
    'listMyJobPostings',
    () => actions.listMyJobPostings(),
    member,
    mocks.posting.listMyJobPostings,
    'oturum-uye',
  ],
  [
    'searchJobPostings',
    () => actions.searchJobPostings(),
    member,
    mocks.posting.searchJobPostings,
    'oturum-uye',
  ],
  [
    'getJobPostingFilterOptions',
    () => actions.getJobPostingFilterOptions(),
    member,
    mocks.posting.getJobPostingFilterOptions,
    'oturum-uye',
  ],
  [
    'getJobPosting',
    () => actions.getJobPosting({ id: 'p1' }),
    member,
    mocks.posting.getJobPosting,
    'oturum-uye',
  ],
  [
    'reportJobPosting',
    () => actions.reportJobPosting({ postingId: 'p1', reason: 'Sahte ilan görünüyor' }),
    member,
    mocks.posting.reportJobPosting,
    'oturum-uye',
  ],
  [
    'listJobPostingModerationQueue',
    () => actions.listJobPostingModerationQueue(),
    admin,
    mocks.moderation.listJobPostingModerationQueue,
    'oturum-moderator',
  ],
  [
    'reviewJobPosting',
    () => actions.reviewJobPosting({ postingId: 'p1', decision: 'PUBLISH' }),
    admin,
    mocks.moderation.reviewJobPosting,
    'oturum-moderator',
  ],
  [
    'listJobPostingReports',
    () => actions.listJobPostingReports(),
    admin,
    mocks.moderation.listJobPostingReports,
    'oturum-moderator',
  ],
  [
    'resolveJobPostingReport',
    () =>
      actions.resolveJobPostingReport({
        reportId: 'r1',
        decision: 'DISMISS',
        reason: 'Sorun görülmedi',
      }),
    admin,
    mocks.moderation.resolveJobPostingReport,
    'oturum-moderator',
  ],
] as const;

describe('ilan eylemleri', () => {
  it('her eylem sözleşmedeki erişim kataloğunda vardır', () => {
    expect(cases.map((c) => c[0]).sort()).toEqual(Object.keys(JOB_POSTING_ACTION_ACCESS).sort());
  });

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

  it('yazar eylemleri mezun/akademisyen rolü ister; okuyucu eylemleri rolsüz doğrulanmış üye', async () => {
    await actions.getJobPostingFormContext();
    await actions.saveJobPostingDraft({ departmentId: 'd1', content: draftContent });
    await actions.submitJobPosting({ postingId: 'p1' });
    await actions.closeJobPosting({ postingId: 'p1' });
    await actions.listMyJobPostings();
    expect(mocks.requireVerifiedMember).toHaveBeenCalledTimes(5);
    for (const call of mocks.requireVerifiedMember.mock.calls)
      expect(call[0]).toEqual({ roles: ['ALUMNI', 'ACADEMIC'] });
    mocks.requireVerifiedMember.mockClear();
    await actions.searchJobPostings();
    await actions.getJobPosting({ id: 'p1' });
    await actions.getJobPostingFilterOptions();
    await actions.reportJobPosting({ postingId: 'p1', reason: 'Sahte ilan görünüyor' });
    expect(mocks.requireVerifiedMember).toHaveBeenCalledTimes(4);
    for (const call of mocks.requireVerifiedMember.mock.calls) expect(call).toEqual([]);
  });

  it('geçersiz girdi ve istemciden gelen kimlik/durum alanları servise ulaşmaz', async () => {
    for (const bad of [
      () =>
        actions.saveJobPostingDraft({
          departmentId: 'd1',
          content: {},
          authorId: 'baska',
        } as never),
      () =>
        actions.saveJobPostingDraft({
          departmentId: 'd1',
          content: { status: 'PUBLISHED' },
        } as never),
      () =>
        actions.saveJobPostingDraft({
          departmentId: 'd1',
          content: { applyUrl: 'javascript:alert(1)' },
        }),
      () => actions.submitJobPosting({ postingId: '' }),
      () => actions.submitJobPosting({ postingId: 'p1', authorId: 'baska' } as never),
      () => actions.searchJobPostings({ q: 'a' }),
      () => actions.searchJobPostings({ companyId: 'c1', organizationName: 'Örnek' }),
      () => actions.reportJobPosting({ postingId: 'p1', reason: '' }),
      () => actions.reviewJobPosting({ postingId: 'p1', decision: 'REJECT' } as never),
      () => actions.reviewJobPosting({ postingId: 'p1', decision: 'DELETE' } as never),
      () =>
        actions.resolveJobPostingReport({
          reportId: 'r1',
          decision: 'RESOLVED',
          reason: 'Yok',
        } as never),
    ])
      expect(await bad()).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    for (const fn of [...Object.values(mocks.posting), ...Object.values(mocks.moderation)])
      expect(fn).not.toHaveBeenCalled();
  });

  it('alan hatası kararlı kodla döner (bağlantı ve tarih)', async () => {
    const result = await actions.saveJobPostingDraft({
      departmentId: 'd1',
      content: { applyUrl: 'http://example.com/x', deadlineOn: 'yarın' },
    });
    expect(result).toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: {
        'content.applyUrl': 'JOB_POSTING_URL_INVALID',
        'content.deadlineOn': 'JOB_POSTING_DEADLINE_INVALID',
      },
    });
  });

  it('beklenmeyen hata ayrıntı sızdırmaz', async () => {
    mocks.posting.searchJobPostings.mockRejectedValue(new Error('postgres://gizli@host/db'));
    expect(await actions.searchJobPostings()).toEqual({
      ok: false,
      errorCode: 'SERVER_UNEXPECTED',
    });
  });
});
