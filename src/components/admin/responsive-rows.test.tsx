// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { ResponsiveRows } from './responsive-rows';

it('mobil kartta ilk ve son hücre tam genişlik, ortadakiler tek sütun; etiketler korunur', () => {
  renderUi(
    <ResponsiveRows
      headers={['Eylem', 'Puan', 'Gecikme', 'İşlemler']}
      rows={[{ id: 'a', cells: ['Deneyim', '5', '0 gün', <button key="b">Düzenle</button>] }]}
    />,
  );
  const card = screen.getByRole('listitem');
  const terms = within(card).getAllByRole('term');
  expect(terms.map((t) => t.textContent)).toEqual(['Eylem', 'Puan', 'Gecikme', 'İşlemler']);
  const groups = terms.map((t) => t.parentElement!);
  expect(groups[0]!.className).toContain('col-span-2');
  expect(groups[1]!.className).not.toContain('col-span-2');
  expect(groups[2]!.className).not.toContain('col-span-2');
  expect(groups[3]!.className).toContain('col-span-2');
});
