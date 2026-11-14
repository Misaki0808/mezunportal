import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ state: vi.fn(), departments: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/server/actions/auth', () => ({
  getVerificationState: mocks.state,
  listSelectableDepartments: mocks.departments,
}));
vi.mock('@/server/actions/graduation-document', () => ({ uploadGraduationDocument: vi.fn() }));

import { VerificationPanel } from '../verification-panel';
import GraduationDocumentPage from './page';

const state = (status: string) => ({
  ok: true,
  data: { status, emailKind: 'OTHER', pendingDocument: null, rejection: null },
});
beforeEach(() => {
  mocks.state.mockReset();
  mocks.departments.mockReset().mockResolvedValue({ ok: true, data: { departments: [] } });
});

describe('mezun belgesi sayfası', () => {
  it.each(['VERIFIED', 'AWAITING_REVIEW'])(
    '%s kullanıcıya form değil durum ekranı gösterilir; bölüm listesi bile istenmez',
    async (status) => {
      mocks.state.mockResolvedValue(state(status));
      const page = (await GraduationDocumentPage()) as { type: unknown; props: { state: unknown } };
      expect(page.type).toBe(VerificationPanel);
      expect(page.props.state).toMatchObject({ status });
      expect(mocks.departments).not.toHaveBeenCalled();
    },
  );

  it.each(['NOT_STARTED', 'REJECTED'])('%s kullanıcıya belge formu gösterilir', async (status) => {
    mocks.state.mockResolvedValue(state(status));
    const page = (await GraduationDocumentPage()) as { type: unknown };
    expect(page.type).not.toBe(VerificationPanel);
    expect(mocks.departments).toHaveBeenCalledTimes(1);
  });

  it('durum okunamazsa form yine açılır (sunucu yeni belgeyi zaten reddeder)', async () => {
    mocks.state.mockRejectedValue(new Error('db'));
    const page = (await GraduationDocumentPage()) as { type: unknown };
    expect(page.type).not.toBe(VerificationPanel);
    expect(mocks.departments).toHaveBeenCalledTimes(1);
  });
});
