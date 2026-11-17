// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { CalendarPage } from './calendar';

describe('başvuru takvimi sayfası (kart 424)', () => {
  it('kapsam seçilmemişken: tek h1, süzgeç formu aynı adrese gider, boş durum yönlendirir, eski kapsayıcı yok', () => {
    const { container } = renderUi(
      <CalendarPage
        companies={[{ id: 'c1', name: 'Örnek Yazılım A.Ş.' }]}
        sectors={[{ id: 's1', name: 'Bilişim ve Yazılım' }]}
        scope={null}
        data={null}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Başvuru takvimi' })).toBeVisible();
    const form = container.querySelector('form[action="/basvuru-takvimi"]') as HTMLElement;
    expect(within(form).getByLabelText('Şirket')).toHaveAttribute('name', 'companyId');
    expect(within(form).getByRole('button', { name: 'Takvimi göster' })).toBeVisible();
    expect(screen.getByText(/Bir şirket veya sektör seçerek/)).toBeVisible();
    expect(container.querySelector('.mx-auto')).toBeNull();
  });
});
