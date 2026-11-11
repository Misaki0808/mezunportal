// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { CourseAdmin } from './course-admin';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/course-guide', () => ({ saveCourse: vi.fn() }));

it('listeyi parçalar hâlinde gösterir ve Türkçe ders kodu veya adına göre arar', async () => {
  const user = userEvent.setup();
  const courses = Array.from({ length: 21 }, (_, i) => ({
    id: String(i),
    departmentId: 'd',
    code: `YBS${i}`,
    name: i === 20 ? 'İş Analizi' : `Ders ${i}`,
    semester: 1,
    elective: true,
  }));
  renderUi(<CourseAdmin departments={[{ id: 'd', name: 'YBS' }]} courses={courses} />);
  expect(screen.getByText('21 ders bulundu.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Ders 10/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Daha fazla göster' }));
  expect(screen.getByRole('button', { name: /Ders 10/ })).toBeVisible();
  await user.type(screen.getByRole('searchbox', { name: 'Ders ara' }), 'iş analizi');
  expect(screen.getByText('1 ders bulundu.')).toBeVisible();
  expect(screen.getByRole('button', { name: /İş Analizi/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Ders 0/ })).toBeNull();
});
