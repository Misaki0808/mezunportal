import { beforeEach, expect, it, vi } from 'vitest';
import { codedForbidden } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), options: vi.fn(), search: vi.fn() }));
vi.mock('@/server/permissions', () => ({ requireVerifiedMember: mocks.actor }));
vi.mock('@/server/actions/job-postings', () => ({
  getJobPostingFilterOptions: mocks.options,
  searchJobPostings: mocks.search,
}));
import PostingsPage from './page';
beforeEach(() => {
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
