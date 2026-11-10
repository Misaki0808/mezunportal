// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { CourseSelector } from './course-selector';
vi.mock('@/server/actions/course-guide', () => ({
  saveAlumniCourses: vi.fn(async () => ({ ok: true, data: { saved: true } })),
}));
it('beş seçimden sonra başka seçim kapalıdır; arama ders kodunu bulur', async () => {
  const user = userEvent.setup();
  const courses = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    name: `Ders ${i}`,
    code: `KOD${i}`,
    semester: 1,
    elective: true,
  }));
  renderUi(<CourseSelector courses={courses} initial={courses.slice(0, 5).map((c) => c.id)} />);
  expect(screen.getByRole('checkbox', { name: /Ders 5/ })).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: /Ders 0/ }));
  expect(screen.getByRole('checkbox', { name: /Ders 5/ })).toBeEnabled();
  await user.type(screen.getByLabelText('Ders ara'), 'kod5');
  expect(screen.getByRole('checkbox', { name: /Ders 5/ })).toBeVisible();
  expect(screen.queryByRole('checkbox', { name: /Ders 1/ })).toBeNull();
});
