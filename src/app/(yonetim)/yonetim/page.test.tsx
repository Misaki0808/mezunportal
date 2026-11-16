// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { getAdminOverview } from '@/server/actions/admin';
vi.mock('@/components/layout/admin-access', () => ({ hasAdminAccess: async () => true }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: { count: number }) =>
    values ? `${key}: ${values.count}` : key,
}));
vi.mock('@/server/actions/admin', () => ({
  getAdminOverview: vi.fn(async () => ({
    ok: true,
    data: {
      capabilities: {
        users: true,
        reports: true,
        employmentReport: true,
        dictionaries: false,
        unmatchedValues: false,
        adminGrants: false,
        auditLog: false,
      },
      counts: {
        pendingGraduationDocuments: 2,
        pendingExperiences: 0,
        pendingFaqRequests: 3,
        pendingJobPostings: 4,
        pendingReferrals: 5,
        pendingCampusEvents: 6,
        pendingAlumniStories: 7,
        openReports: 1,
        suspendedUsers: 0,
        openUnmatchedValues: null,
      },
    },
  })),
}));
import Page from './page';
it('kuyruk kartlarında sunucu sayısını gösterir; sıfır görünür, kapsam dışı sistem kartı görünmez', async () => {
  renderUi(await Page());
  expect(
    within(screen.getByRole('link', { name: /sections.documents/ })).getByText('pendingCount: 2'),
  ).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /sections.experiences/ })).getByText('pendingCount: 0'),
  ).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /adminTitle/ })).getByText('pendingCount: 6'),
  ).toBeVisible();
  const pending = screen
    .getByRole('heading', { name: 'overview.pendingTitle' })
    .closest('section')!;
  expect(within(pending).getByRole('link', { name: /sections.documents/ })).toBeVisible();
  expect(within(pending).queryByRole('link', { name: /sections.experiences/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /sections.unmatchedValues/ })).toBeNull();
  expect(screen.getByRole('link', { name: /sections.courses/ })).toHaveAttribute(
    'href',
    '/yonetim/dersler',
  );
});

it('bütün görünür kuyruklar boşken sakin boş durum ve gerçek sıfırlar gösterilir', async () => {
  const result = await getAdminOverview();
  if (!result.ok) throw new Error('fixture overview missing');
  vi.mocked(getAdminOverview).mockResolvedValueOnce({
    ok: true,
    data: {
      ...result.data,
      counts: {
        pendingGraduationDocuments: 0,
        pendingExperiences: 0,
        pendingFaqRequests: 0,
        pendingJobPostings: 0,
        pendingReferrals: 0,
        pendingCampusEvents: 0,
        pendingAlumniStories: 0,
        openReports: 0,
        suspendedUsers: 0,
        openUnmatchedValues: null,
      },
    },
  });
  renderUi(await Page());
  expect(screen.getByRole('heading', { name: 'overview.clearTitle' })).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /sections.documents/ })).getByText('pendingCount: 0'),
  ).toBeVisible();
  expect(screen.queryByRole('link', { name: /sections.unmatchedValues/ })).toBeNull();
});
