// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
const search = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('@/server/actions/interview-questions', () => ({ getInterviewQuestions: search }));
vi.mock('@/components/interview-questions/question-bank', () => ({
  QuestionBank: () => <div>Mülakat tüyoları</div>,
}));
import Page from './page';
beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue({
    ok: true,
    data: {
      companies: [],
      sectors: [],
      groups: [],
      insufficient: false,
      total: 100,
      page: 1,
      pageSize: 20,
    },
  });
});
it.each([
  [
    { q: 'x'.repeat(101), companyId: 'selected-company' },
    { companyId: 'selected-company', sectorId: '', q: '' },
  ],
  [{ companyId: ['a', 'b'] }, { companyId: '', sectorId: '', q: '' }],
  [{ sectorId: ['a', 'b'] }, { companyId: '', sectorId: '', q: '' }],
  [{ page: '-1' }, { companyId: '', sectorId: '', q: '' }],
  [{ page: ['1', '2'] }, { companyId: '', sectorId: '', q: '' }],
])(
  'bozuk URL parametresi sessizce varsayılana düşer, geçerli olanlar korunur: %j',
  async (params, expected) => {
    renderUi(await Page({ searchParams: Promise.resolve(params) }));
    expect(search).toHaveBeenCalledWith(expected);
    expect(screen.getByText('Mülakat tüyoları')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);
it('aralık dışı sayfa son geçerli sayfaya yönlendirilir', async () => {
  search.mockResolvedValue({
    ok: true,
    data: {
      companies: [],
      sectors: [],
      groups: [],
      insufficient: false,
      total: 30,
      page: 9,
      pageSize: 20,
    },
  });
  await expect(Page({ searchParams: Promise.resolve({ q: 'SQL', page: '9' }) })).rejects.toThrow(
    'REDIRECT:/mulakat-tuyolari?q=SQL&page=2',
  );
});
it('geçerli sayfa numarasını sayısal değere çevirir', async () => {
  renderUi(await Page({ searchParams: Promise.resolve({ q: 'SQL', page: '2' }) }));
  expect(search).toHaveBeenCalledWith({ companyId: '', sectorId: '', q: 'SQL', page: 2 });
});
it('geçerli URL seçili şirketi ve aramayı korur', async () => {
  renderUi(await Page({ searchParams: Promise.resolve({ companyId: 'company', q: 'SQL' }) }));
  expect(search).toHaveBeenCalledWith({ companyId: 'company', sectorId: '', q: 'SQL' });
});
