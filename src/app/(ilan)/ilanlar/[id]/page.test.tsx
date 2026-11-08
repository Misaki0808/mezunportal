import { expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/server/actions/job-postings', () => ({
  getJobPosting: actions.get,
  previewJobPostingContact: async () => ({
    ok: true,
    data: { canRequest: false, postingTitle: null, organizationName: null, requestableFields: [] },
  }),
}));
import DetailPage from './page';
it('sunucu, geçiş servisinden gelen yazar kimliğini istemci bileşenine geçirmez', async () => {
  actions.get.mockResolvedValue({
    ok: true,
    data: {
      id: 'ilan',
      kind: 'INTERNSHIP',
      title: 'Staj',
      organizationName: 'Kurum',
      companyId: null,
      location: 'İstanbul',
      isRemote: false,
      deadlineOn: '2027-01-01',
      daysLeft: 2,
      applyMethod: 'CONTACT_REQUEST',
      publishedAt: new Date(),
      authorKind: 'ALUMNI',
      targetDepartments: [],
      description: 'Örnek',
      applyUrl: null,
      contactUserId: 'gizli-yazar',
    },
  });
  const result = await DetailPage({ params: Promise.resolve({ id: 'ilan' }) });
  expect(JSON.stringify(result.props)).not.toContain('gizli-yazar');
  expect(result.props.posting.id).toBe('ilan');
});
