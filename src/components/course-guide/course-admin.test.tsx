// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { CourseAdmin } from './course-admin';
import { saveCourse } from '@/server/actions/course-guide';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/course-guide', () => ({
  saveCourse: vi.fn(async () => ({ ok: true, data: { saved: true } })),
}));

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

it('boş yarıyıl sıfıra dönüşmez; alan hatası ve odakla veri korunur, gerçek sıfır geçer', async () => {
  vi.mocked(saveCourse).mockClear();
  const user = userEvent.setup();
  renderUi(<CourseAdmin departments={[{ id: 'd1', name: 'YBS' }]} courses={[]} />);
  await user.type(screen.getByLabelText(/Ders kodu/), 'YBS101');
  await user.type(screen.getByLabelText(/Ders adı/), 'Veri Analitiği');
  const semester = screen.getByLabelText(/Yarıyıl/);
  await user.clear(semester);
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(saveCourse).not.toHaveBeenCalled();
  expect(semester).toHaveFocus();
  expect(semester).toBeInvalid();
  expect(semester).toHaveAccessibleDescription();
  expect(semester).toHaveAccessibleDescription('0 ile 8 arasında bir yarıyıl gir.');
  expect(screen.getByLabelText(/Ders adı/)).toHaveValue('Veri Analitiği');
  await user.type(semester, '0');
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(saveCourse).toHaveBeenCalledWith(expect.objectContaining({ semester: 0 })),
  );
});

it('uzun ders kodu kesilip kaydedilmez; alan hatası değeri korur', async () => {
  vi.mocked(saveCourse).mockClear();
  const user = userEvent.setup();
  renderUi(<CourseAdmin departments={[{ id: 'd1', name: 'YBS' }]} courses={[]} />);
  const code = screen.getByLabelText(/Ders kodu/);
  expect(code).not.toHaveAttribute('maxlength');
  await user.type(code, 'A'.repeat(33));
  await user.type(screen.getByLabelText(/Ders adı/), 'Veri Analitiği');
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(code).toHaveValue('A'.repeat(33));
  expect(code).toHaveFocus();
  expect(code).toBeInvalid();
  expect(saveCourse).not.toHaveBeenCalled();
});
