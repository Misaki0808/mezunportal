import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedConflict, codedRateLimited, codedUnauthenticated } from '@/lib/errors';

// Eylemler ince yapıştırıcıdır: sıra (kimlik → doğrulama → servis) ve hata biçimi burada sınanır.
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  service: {
    getCvAvailability: vi.fn(),
    uploadCv: vi.fn(),
    getLatestCv: vi.fn(),
    getCvStatus: vi.fn(),
    getCvReview: vi.fn(),
    applyCv: vi.fn(),
    discardCv: vi.fn(),
    listExperienceInvitations: vi.fn(),
    dismissExperienceInvitation: vi.fn(),
  },
}));

vi.mock('../permissions', () => ({ requireUser: mocks.requireUser }));
vi.mock('./deps', () => ({ cvDeps: () => ({ marker: 'deps' }) }));
vi.mock('../services/cv', () => mocks.service);

import * as actions from './cv';

const ACTOR = { userId: 'oturum-kullanicisi', facts: {} };
const pdf = () =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'cv.pdf', { type: 'application/pdf' });

beforeEach(() => {
  mocks.requireUser.mockReset().mockResolvedValue(ACTOR);
  for (const fn of Object.values(mocks.service)) fn.mockReset();
});

describe('kimlik her eylemden ÖNCE gelir', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['getCvAvailability', () => actions.getCvAvailability()],
    ['uploadCv', () => actions.uploadCv(Object.assign(new FormData(), {}))],
    ['getLatestCv', () => actions.getLatestCv()],
    ['getCvStatus', () => actions.getCvStatus({ cvUploadId: 'x' })],
    ['getCvReview', () => actions.getCvReview({ cvUploadId: 'x' })],
    [
      'applyCv',
      () => actions.applyCv({ cvUploadId: 'x', decisions: [{ key: 'a', section: 'SKILL' }] }),
    ],
    ['discardCv', () => actions.discardCv({ cvUploadId: 'x' })],
    ['listExperienceInvitations', () => actions.listExperienceInvitations()],
    [
      'dismissExperienceInvitation',
      () => actions.dismissExperienceInvitation({ invitationId: 'x' }),
    ],
  ];

  it('bütün dışa açık eylemler kapsanır', () => {
    expect(calls.map(([name]) => name).sort()).toEqual(Object.keys(actions).sort());
  });

  it.each(calls)(
    '%s oturumsuz AUTH_UNAUTHENTICATED döner; servis ve girdi işlenmez',
    async (_name, call) => {
      mocks.requireUser.mockRejectedValue(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
      expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
      for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
    },
  );
});

describe('uploadCv', () => {
  it('geçersiz dosya servise ulaşmaz; hata dosya alanının altında döner', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(10)], 'x.png', { type: 'image/png' }));
    expect(await actions.uploadCv(form)).toEqual({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { file: 'DOCUMENT_NOT_PDF' },
    });
    expect(mocks.service.uploadCv).not.toHaveBeenCalled();
    expect(await actions.uploadCv(new FormData())).toMatchObject({
      fieldErrors: { file: 'DOCUMENT_REQUIRED' },
    });
  });

  it('kullanıcı kimliği yalnız oturumdan gelir; formdaki userId yok sayılır', async () => {
    mocks.service.uploadCv.mockResolvedValue({ cvUploadId: 'c1', status: 'QUEUED' });
    const form = new FormData();
    form.set('file', pdf());
    form.set('userId', 'baska-kullanici');
    expect(await actions.uploadCv(form)).toEqual({
      ok: true,
      data: { cvUploadId: 'c1', status: 'QUEUED' },
    });
    const [deps, actor, parsed] = mocks.service.uploadCv.mock.calls[0]!;
    expect(deps).toEqual({ marker: 'deps' });
    expect(actor).toBe(ACTOR);
    expect(Object.keys(parsed)).toEqual(['file']);
  });

  it('servis hataları kararlı kod (ve parametre) olarak döner; beklenmeyen hata ayrıntı sızdırmaz', async () => {
    const form = new FormData();
    form.set('file', pdf());
    mocks.service.uploadCv.mockRejectedValueOnce(
      codedRateLimited('CV_DAILY_LIMIT_REACHED', { limit: 5 }),
    );
    expect(await actions.uploadCv(form)).toEqual({
      ok: false,
      errorCode: 'CV_DAILY_LIMIT_REACHED',
      params: { limit: 5 },
    });
    mocks.service.uploadCv.mockRejectedValueOnce(codedConflict('CV_ALREADY_PROCESSING'));
    expect(await actions.uploadCv(form)).toEqual({ ok: false, errorCode: 'CV_ALREADY_PROCESSING' });
    mocks.service.uploadCv.mockRejectedValueOnce(new Error('postgres://gizli@host/db patladı'));
    expect(await actions.uploadCv(form)).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });
});

describe('applyCv', () => {
  it('geçersiz karar listesi servise ulaşmaz', async () => {
    for (const input of [
      { cvUploadId: 'x', decisions: [] },
      { cvUploadId: '', decisions: [{ key: 'a', section: 'SKILL' }] },
      { cvUploadId: 'x', decisions: [{ key: 'a', section: 'ROLE' }] },
      {
        cvUploadId: 'x',
        decisions: [
          { key: 'a', section: 'SKILL' },
          { key: 'a', section: 'SKILL' },
        ],
      },
    ]) {
      expect(await actions.applyCv(input as never)).toMatchObject({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
      });
    }
    expect(mocks.service.applyCv).not.toHaveBeenCalled();
  });

  it('servise yalnız doğrulanmış cvUploadId ve kararlar gider (istemcinin eklediği alanlar atılır)', async () => {
    mocks.service.applyCv.mockResolvedValue({ created: 1, updated: 0, invitations: 0 });
    await actions.applyCv({
      cvUploadId: 'cv-1',
      userId: 'baska',
      role: 'ADMIN',
      decisions: [{ key: 'SKILL:abc', section: 'SKILL' }],
    } as never);
    const input = mocks.service.applyCv.mock.calls[0]![2];
    expect(input).toEqual({
      cvUploadId: 'cv-1',
      decisions: [{ key: 'SKILL:abc', section: 'SKILL', overwriteMine: false }],
    });
  });
});

describe('kimlik gerektiren okuma eylemleri', () => {
  it('kimliği boş olan istek VALIDATION_INVALID', async () => {
    expect(await actions.getCvStatus({ cvUploadId: '' })).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    expect(await actions.getCvReview({ cvUploadId: '' })).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    expect(await actions.discardCv({ cvUploadId: '' })).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
    expect(await actions.dismissExperienceInvitation({ invitationId: '' })).toMatchObject({
      errorCode: 'VALIDATION_INVALID',
    });
  });

  it('başarı sonuçları ActionResult olarak sarılır', async () => {
    mocks.service.getCvAvailability.mockResolvedValue({
      available: true,
      reason: null,
      dailyLimit: 5,
      remainingToday: 5,
    });
    mocks.service.getLatestCv.mockResolvedValue(null);
    expect(await actions.getCvAvailability()).toMatchObject({ ok: true });
    expect(await actions.getLatestCv()).toEqual({ ok: true, data: null });
  });
});
