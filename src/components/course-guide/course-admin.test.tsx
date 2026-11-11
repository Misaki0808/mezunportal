// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { CourseAdmin } from './course-admin';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/course-guide', () => ({
  saveCourse: vi.fn(async () => ({ ok: true, data: { saved: true } })),
}));

it('bölüm tanımlı değilken Kaydet kapalıdır ve sebebi yazar', () => {
  renderUi(<CourseAdmin departments={[]} courses={[]} />);
  const save = screen.getByRole('button', { name: 'Kaydet' });
  expect(save).toBeDisabled();
  expect(save).toHaveAccessibleDescription('Önce bir bölüm tanımlı olmalı.');
});

it('bölüm varken Kaydet açıktır', () => {
  renderUi(<CourseAdmin departments={[{ id: 'd1', name: 'YBS' }]} courses={[]} />);
  expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
});
