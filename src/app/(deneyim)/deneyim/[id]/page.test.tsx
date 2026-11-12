// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  user: vi.fn(),
  ownership: vi.fn(),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/detail-route', () => ({ requestExperienceDetail: mocks.detail }));
vi.mock('@/server/permissions', () => ({ requireUser: mocks.user }));
vi.mock('@/server/actions/experience', () => ({
  listMyExperiences: vi.fn(),
  reportExperience: vi.fn(),
}));
vi.mock('@/components/experience/anonymous-ownership', () => ({
  findAnonymousOwnership: mocks.ownership,
}));
vi.mock('@/components/experience/report-sheet', () => ({ ReportExperience: () => null }));
vi.mock('@/components/experience/experience-content', () => ({
  ExperienceContent: ({ showOrganization }: { showOrganization?: boolean }) => (
    <div data-testid="content" data-org={String(showOrganization)} />
  ),
}));
import Page from './page';

const experience = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  status: 'PUBLISHED',
  isAnonymous: false,
  author: { id: 'writer', displayName: 'Yazar Kişi' },
  publishedAt: new Date('2026-10-28T10:00:00Z'),
  moderationNote: null,
  content: { type: 'INTERNSHIP', organizationName: 'Örnek A.Ş.' },
  ...over,
});
const open = async () => renderUi(await Page({ params: Promise.resolve({ id: 'e1' }) }));
const back = () => screen.getAllByRole('link')[0]!;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ userId: 'reader' });
  mocks.detail.mockResolvedValue({ ok: true, data: experience() });
});

describe('deneyim detayı: geri bağlantısı', () => {
  it('başkasının deneyimini okuyan arama listesine döner ("Deneyimlere dön"), "Deneyimlerim"e değil', async () => {
    await open();
    expect(back()).toHaveAttribute('href', '/deneyimler');
    expect(back()).toHaveTextContent('detail.backList');
  });

  it('yazar kendi deneyimlerine döner', async () => {
    mocks.user.mockResolvedValue({ userId: 'writer' });
    await open();
    expect(back()).toHaveAttribute('href', '/deneyimlerim');
    expect(back()).toHaveTextContent('detail.backMine');
  });

  it('anonim deneyimde sahiplik sunucudan sorulur: sahibiyse Deneyimlerim, değilse liste', async () => {
    mocks.detail.mockResolvedValue({
      ok: true,
      data: experience({ isAnonymous: true, author: undefined }),
    });
    mocks.ownership.mockResolvedValue(true);
    const { unmount } = await open();
    expect(back()).toHaveAttribute('href', '/deneyimlerim');
    unmount();
    mocks.ownership.mockResolvedValue(false);
    await open();
    expect(back()).toHaveAttribute('href', '/deneyimler');
  });

  it('sahiplik belirsizse (oturumsuz okuyucu) güvenli varsayılan liste olur', async () => {
    mocks.user.mockRejectedValue(new Error('oturum yok'));
    await open();
    expect(back()).toHaveAttribute('href', '/deneyimler');
  });

  it('başlık kurumu söylediği için içerikte kurum satırı gizlenir', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Örnek A.Ş.');
    expect(screen.getByTestId('content')).toHaveAttribute('data-org', 'false');
  });
});
