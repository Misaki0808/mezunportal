// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
vi.mock('@/components/layout/admin-access', () => ({ hasAdminAccess: async () => true }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: { count: number }) =>
    values ? `${key}: ${values.count}` : key,
}));
vi.mock('@/server/actions/admin', () => ({
  getAdminOverview: async () => ({
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
        openUnmatchedValues: null,
      },
    },
  }),
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
  expect(screen.queryByRole('link', { name: /sections.unmatchedValues/ })).toBeNull();
});
