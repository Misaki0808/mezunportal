import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: vi.fn(), sectors: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
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
  mocks.search.mockResolvedValue({
    ok: true,
    data: { items: [], total: 100, page: 2, hasMore: true },
  });
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
it('geçersiz parametre sessizce varsayılana düşer: hata ekranı yok, arama varsayılanla çalışır', async () => {
  for (const page of ['-1', '0', 'abc', '1.5']) {
    mocks.search.mockClear();
    const guard = (await AlumniPage({
      searchParams: Promise.resolve({ page }),
    })) as unknown as Node;
    expect(mocks.search).toHaveBeenCalledWith({ page: 1 });
    expect((guard.props.children as Node).type).toBe(AlumniDirectory);
  }
  mocks.search.mockClear();
  await AlumniPage({ searchParams: Promise.resolve({ q: 'a', company: 'Banka' }) });
  expect(mocks.search).toHaveBeenCalledWith({ company: 'Banka', page: 1 });
});
it('aralık dışı sayfa son geçerli sayfaya yönlendirilir; çok büyük sayfa önce üst sınıra indirilir', async () => {
  mocks.search.mockResolvedValue({
    ok: true,
    data: { items: [], total: 60, page: 3, hasMore: false },
  });
  await expect(
    AlumniPage({ searchParams: Promise.resolve({ q: 'Deniz', page: '9' }) }),
  ).rejects.toThrow('REDIRECT:/mezunlar?q=Deniz&page=3');
  await AlumniPage({ searchParams: Promise.resolve({ page: '5000' }) }).catch(() => undefined);
  expect(mocks.search).toHaveBeenLastCalledWith({ page: 1000 });
  mocks.search.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, page: 1, hasMore: false },
  });
  await expect(AlumniPage({ searchParams: Promise.resolve({ page: '4' }) })).rejects.toThrow(
    'REDIRECT:/mezunlar',
  );
});
