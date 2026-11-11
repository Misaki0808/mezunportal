// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
const search = vi.hoisted(() => vi.fn());
vi.mock('@/server/actions/interview-questions', () => ({ getInterviewQuestions: search }));
vi.mock('@/components/interview-questions/question-bank', () => ({
  QuestionBank: () => <div>Soru bankası</div>,
}));
import Page from './page';
beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue({
    ok: true,
    data: { companies: [], sectors: [], groups: [], insufficient: false },
  });
});
it.each([
  { q: 'x'.repeat(101), companyId: 'selected-company' },
  { companyId: ['a', 'b'] },
  { sectorId: ['a', 'b'] },
  { page: '-1' },
  { page: ['1', '2'] },
])('bozuk URL tüm süzgeçleri düşürerek genel arama yapmaz: %j', async (params) => {
  renderUi(await Page({ searchParams: Promise.resolve(params) }));
  expect(search).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeVisible();
});
it('geçerli sayfa numarasını sayısal değere çevirir', async () => {
  renderUi(await Page({ searchParams: Promise.resolve({ q: 'SQL', page: '2' }) }));
  expect(search).toHaveBeenCalledWith({ companyId: '', sectorId: '', q: 'SQL', page: 2 });
});
it('geçerli URL seçili şirketi ve aramayı korur', async () => {
  renderUi(await Page({ searchParams: Promise.resolve({ companyId: 'company', q: 'SQL' }) }));
  expect(search).toHaveBeenCalledWith({ companyId: 'company', sectorId: '', q: 'SQL' });
});
