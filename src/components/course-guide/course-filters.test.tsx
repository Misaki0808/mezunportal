// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { CourseFilters } from './course-filters';

it('süzgeç alanları etiketlidir, adresten gelen değerlerle dolar ve bir arama bölgesidir', () => {
  renderUi(<CourseFilters query="veri" semester={3} kind="elective" />);
  const form = screen.getByRole('search', { name: 'Filtreler' });
  expect(within(form).getByLabelText('Ders ara')).toHaveValue('veri');
  expect(within(form).getByRole('combobox', { name: 'Yarıyıl' })).toHaveValue('3');
  expect(within(form).getByRole('combobox', { name: 'Ders türü' })).toHaveValue('elective');
  expect(within(form).getByRole('button', { name: 'Filtrele' })).toHaveAttribute('type', 'submit');
  expect(within(form).getByRole('option', { name: '3. yarıyıl' })).toBeInTheDocument();
});

it('değer yokken "Tümü" seçilidir', () => {
  renderUi(<CourseFilters />);
  expect(screen.getByRole('combobox', { name: 'Yarıyıl' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Ders türü' })).toHaveValue('');
});
