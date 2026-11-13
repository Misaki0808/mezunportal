// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';

const mocks = vi.hoisted(() => ({ guide: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));
vi.mock('@/server/actions/course-guide', () => ({ getCourseGuide: mocks.guide }));
import Page from './page';

it('değerlendirilmiş ders kartta, eşiğin altındakiler yarıyıl sırasıyla kompakt listede gösterilir', async () => {
  mocks.guide.mockResolvedValue({
    ok: true,
    data: [
      {
        id: 'a',
        code: 'YBSB3',
        name: 'Üçüncü yarıyıl dersi',
        semester: 3,
        elective: true,
        count: null,
        sectors: [],
      },
      {
        id: 'b',
        code: 'YBSB1',
        name: 'İlk yarıyıl dersi',
        semester: 1,
        elective: false,
        count: null,
        sectors: [],
      },
      {
        id: 'c',
        code: 'YBSB2',
        name: 'Değerlendirilen ders',
        semester: 2,
        elective: true,
        count: 3,
        sectors: ['Yazılım'],
      },
      {
        id: 'd',
        code: 'ORTAK1',
        name: 'Ortak ders',
        semester: 1,
        elective: false,
        count: null,
        sectors: [],
      },
    ],
  });
  renderUi(
    await Page({ searchParams: Promise.resolve({ q: 'ders', kind: 'elective', semester: '3' }) }),
  );
  expect(mocks.guide).toHaveBeenCalledWith({ query: 'ders', elective: true, semester: 3 });
  const section = screen.getByRole('heading', { name: 'departmentCourses' }).closest('section')!;
  expect(within(section).getByRole('article')).toHaveTextContent('Değerlendirilen ders');
  expect(within(section).getByRole('article')).toHaveTextContent('alumniBadge:3');
  expect(
    within(section)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent),
  ).toEqual([
    'Değerlendirilen ders',
    'semesterNumber:1 · notEnoughShort',
    'semesterNumber:3 · notEnoughShort',
  ]);
  const lists = within(section).getAllByRole('list');
  expect(within(lists[lists.length - 2]!).getByText('İlk yarıyıl dersi')).toBeVisible();
  expect(within(lists[lists.length - 1]!).getByText('Üçüncü yarıyıl dersi')).toBeVisible();
  expect(
    within(section.querySelector('[data-course-code="YBSB1"]') as HTMLElement).getByText(
      'required',
    ),
  ).toBeVisible();
  expect(
    within(section.querySelector('[data-course-code="YBSB3"]') as HTMLElement).getByText(
      'elective',
    ),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'commonCourses' })).toBeVisible();
});
