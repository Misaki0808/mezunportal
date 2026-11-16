import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: vi.fn(), sectors: vi.fn() }));
vi.mock('@/server/actions/alumni-directory', () => ({ searchAlumni: mocks.search }));
vi.mock('@/server/actions/search', () => ({ listSearchSectors: mocks.sectors }));
vi.mock('@/components/privacy/server-guard', () => ({ PrivacyGuard: () => null }));
vi.mock('@/components/alumni/alumni-directory', () => ({ AlumniDirectory: () => null }));
import { AlumniDirectory } from '@/components/alumni/alumni-directory';
import { ErrorState } from '@/components/ui';
import AlumniPage from './page';
type Node = { type: unknown; props: Record<string, unknown> };
beforeEach(() => {
  mocks.search
    .mockReset()
    .mockResolvedValue({ ok: true, data: { items: [], total: 0, page: 1, hasMore: false } });
  mocks.sectors.mockReset().mockResolvedValue({ ok: true, data: { sectors: [] } });
});
it('geçerli URL filtrelerini sunucu aramasına taşır', async () => {
  const guard = (await AlumniPage({
    searchParams: Promise.resolve({ q: 'Deniz', page: '2' }),
  })) as unknown as Node;
  expect(mocks.search).toHaveBeenCalledWith({ q: 'Deniz', page: 2 });
  expect((guard.props.children as Node).type).toBe(AlumniDirectory);
});
it('sektör seçenekleri başarısızsa filtre yokmuş gibi davranmaz', async () => {
  mocks.sectors.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  const guard = (await AlumniPage({ searchParams: Promise.resolve({}) })) as unknown as Node;
  expect((guard.props.children as Node).type).toBe(ErrorState);
});
it('geçersiz filtreyle arama sorgusu çalıştırmaz', async () => {
  await AlumniPage({ searchParams: Promise.resolve({ page: '-1' }) });
  expect(mocks.search).not.toHaveBeenCalled();
});
