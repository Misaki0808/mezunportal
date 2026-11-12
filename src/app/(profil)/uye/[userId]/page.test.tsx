// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
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
  // Başlık yuvalarını (rozet + eylemler) çizer: gerçek bileşendeki gibi eylemler PROFİLİN İÇİNDEDİR, sayfa sonunda değil.
  ProfileView: ({ badges, actions }: { badges?: ReactNode; actions?: ReactNode }) => (
    <article>
      Mezun
      {badges}
      {actions}
    </article>
  ),
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
it('eylemler profil başlığının içinde gelir (sayfa sonunda değil); randevu açıkken birincil eylem "Randevu iste"dir', async () => {
  mocks.entry.mockResolvedValue({
    ok: true,
    data: {
      contact: { available: true, reason: null },
      appointment: { available: true, reason: null },
      cvReview: { available: false, reason: 'CV_REVIEW_DISABLED' },
    },
  });
  renderUi(await Page({ params: Promise.resolve({ userId: 'mentor' }) }));
  const profile = screen.getByRole('article');
  const region = within(profile).getByRole('region', { name: 'Mentorla görüş' });
  const appointment = within(region).getByRole('link', { name: 'Randevu iste' });
  const contact = within(region).getByRole('link', { name: 'İletişim iste' });
  expect(appointment).toHaveAttribute('href', '/randevu-al/mentor');
  // Birincil: dolu zemin; ikincil: çerçeveli (iletişim isteği ikinci sıraya iner).
  expect(appointment.className).toContain('bg-primary');
  expect(contact.className).not.toContain('bg-primary');
  expect(
    appointment.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it('randevu kapalıysa iletişim isteği tek birincil eylem olur ve nedeni yazılır', async () => {
  renderUi(await Page({ params: Promise.resolve({ userId: 'mentor' }) }));
  const contact = screen.getByRole('link', { name: 'İletişim iste' });
  expect(contact.className).toContain('bg-primary');
  expect(screen.queryByRole('link', { name: 'Randevu iste' })).toBeNull();
  expect(screen.getByText('Mentorun bu ayki kapasitesi dolu.')).toBeVisible();
});
it('referans sayısı rozet satırında, sıfırsa hiç görünmez', async () => {
  renderUi(await Page({ params: Promise.resolve({ userId: 'mentor' }) }));
  expect(screen.getByText('profileCount: 3')).toBeVisible();
  mocks.count.mockResolvedValue(0);
  renderUi(await Page({ params: Promise.resolve({ userId: 'mentor2' }) }));
  expect(screen.queryByText('profileCount: 0')).toBeNull();
});
it('inceleyici: profil görünür değilse giriş sorgusu varlık ayrımı yapmaz', async () => {
  mocks.profile.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
  renderUi(await Page({ params: Promise.resolve({ userId: 'hidden' }) }));
  expect(mocks.entry).not.toHaveBeenCalled();
  expect(screen.queryByText('Mentorla görüş')).not.toBeInTheDocument();
});
