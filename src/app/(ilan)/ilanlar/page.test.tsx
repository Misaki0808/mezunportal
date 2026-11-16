import { beforeEach, expect, it, vi } from 'vitest';
import { codedForbidden } from '@/lib/errors';
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  options: vi.fn(),
  search: vi.fn(),
  sectors: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({ requireVerifiedMember: mocks.actor }));
vi.mock('@/server/actions/job-postings', () => ({
  getJobPostingFilterOptions: mocks.options,
  searchJobPostings: mocks.search,
}));
vi.mock('@/server/actions/search', () => ({ listSearchSectors: mocks.sectors }));
import PostingsPage from './page';
beforeEach(() => {
  mocks.sectors.mockResolvedValue({ ok: true, data: { sectors: [] } });
  mocks.options.mockResolvedValue({ ok: true, data: { organizations: [] } });
  mocks.search.mockClear();
});
it.each(['AUTH_NOT_VERIFIED', 'CONSENT_REQUIRED'] as const)(
  'liste beklenen %s durumunu genel sunucu hatasına dönüştürmez',
  async (code) => {
    mocks.actor.mockRejectedValue(codedForbidden(code));
    const result = await PostingsPage({ searchParams: Promise.resolve({}) });
    expect(result.props.errorCode).toBe(code);
    expect(mocks.search).not.toHaveBeenCalled();
  },
);
it('sektör URL kimliği ilan sorgusuna ve görünür seçeneklere taşınır', async () => {
  const sectorId = '018f0000-0000-7000-8000-000000000001';
  mocks.actor.mockResolvedValue({ facts: { memberships: [] } });
  mocks.sectors.mockResolvedValue({
    ok: true,
    data: { sectors: [{ id: sectorId, name: 'Havacılık' }] },
  });
  mocks.options.mockResolvedValue({ ok: true, data: { organizations: [] } });
  mocks.search.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, page: 1, pageSize: 20 },
  });
  const result = await PostingsPage({ searchParams: Promise.resolve({ sectorId }) });
  expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ sectorId }));
  expect(result.props.sectors).toEqual([{ id: sectorId, name: 'Havacılık' }]);
});
