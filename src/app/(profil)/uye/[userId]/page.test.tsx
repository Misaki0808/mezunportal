// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  entry: vi.fn(),
  count: vi.fn().mockResolvedValue(3),
}));
vi.mock('@/server/db', () => ({ getDb: () => ({ referralClaim: { count: mocks.count } }) }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, value: { count: number }) => `${key}: ${value.count}`,
}));
vi.mock('@/server/actions/profile-content', () => ({ getProfile: mocks.profile }));
vi.mock('@/server/actions/mentor-directory', () => ({ getMentorEntryPoints: mocks.entry }));
vi.mock('@/components/profile/profile-view', () => ({
  ProfileView: () => <article>Mezun</article>,
}));
import Page from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ ok: true, data: {} });
  mocks.entry.mockResolvedValue({
    ok: true,
    data: {
      contact: { available: true, reason: null },
      appointment: { available: false, reason: 'CAPACITY_FULL' },
      cvReview: { available: false, reason: 'CV_REVIEW_DISABLED' },
    },
  });
});
it('inceleyici: görünür mentor profilinde iletişim ve kapalı girişlerin nedenleri görünür', async () => {
  renderUi(await Page({ params: Promise.resolve({ userId: 'mentor' }) }));
  expect(mocks.entry).toHaveBeenCalledWith({ userId: 'mentor' });
  expect(screen.getByRole('link', { name: 'İletişim iste' })).toHaveAttribute(
    'href',
    '/iletisim-iste/mentor?donus=%2Fuye%2Fmentor',
  );
  expect(screen.getByText('Mentorun bu ayki kapasitesi dolu.')).toBeVisible();
  expect(screen.getByText('Bu mentor CV incelemesi yapmıyor.')).toBeVisible();
});
it('inceleyici: profil görünür değilse giriş sorgusu varlık ayrımı yapmaz', async () => {
  mocks.profile.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
  renderUi(await Page({ params: Promise.resolve({ userId: 'hidden' }) }));
  expect(mocks.entry).not.toHaveBeenCalled();
  expect(screen.queryByText('Mentorla görüş')).not.toBeInTheDocument();
});
