// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui';
import { renderUi } from '@/test/render';

import { SearchBar } from './search-bar';

describe('SearchBar', () => {
  it('arama alanı, "Ara" ve ek düğme (Filtreler) TEK satırdadır; etiket görünmez ama alanın adıdır', () => {
    renderUi(
      <SearchBar
        label="Deneyim ara"
        hint="Kurum, konu veya anahtar kelime"
        submitLabel="Ara"
        trailing={<Button variant="secondary">Filtreler</Button>}
        input={{ name: 'q' }}
      />,
    );

    const box = screen.getByRole('searchbox', { name: 'Deneyim ara' });
    const submit = screen.getByRole('button', { name: 'Ara' });
    const filters = screen.getByRole('button', { name: 'Filtreler' });
    expect(box.parentElement).toBe(submit.parentElement);
    expect(box.parentElement).toBe(filters.parentElement);
    expect(screen.getByRole('search')).toBeInTheDocument();
    // Etiket yalnız ekran okuyucuya: görünür bir "Deneyim ara" başlığı satırı yoktur.
    expect(screen.getByText('Deneyim ara')).toHaveClass('sr-only');
  });

  it('ipucu yer tutucudadır ve ekran okuyucuya açıklama olarak verilir (görünür ayrı satır yok)', () => {
    renderUi(
      <SearchBar
        label="Deneyim ara"
        hint="Kurum, konu veya anahtar kelime"
        submitLabel="Ara"
        input={{}}
      />,
    );

    const box = screen.getByRole('searchbox', { name: 'Deneyim ara' });
    expect(box).toHaveAttribute('placeholder', 'Kurum, konu veya anahtar kelime');
    expect(box).toHaveAccessibleDescription('Kurum, konu veya anahtar kelime');
    expect(screen.getAllByText('Kurum, konu veya anahtar kelime')).toHaveLength(1);
    expect(screen.getByText('Kurum, konu veya anahtar kelime')).toHaveClass('sr-only');
  });

  it('hata alanın altında, alanla ilişkili ve canlı bölgededir; hata yokken işaret yoktur', () => {
    const { unmount } = renderUi(<SearchBar label="Ara" submitLabel="Ara" input={{}} />);
    expect(screen.getByRole('searchbox')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();

    renderUi(
      <SearchBar
        label="Deneyim ara"
        hint="İpucu"
        submitLabel="Ara"
        error="En az 2 karakter gir."
        input={{}}
      />,
    );
    const box = screen.getByRole('searchbox', { name: 'Deneyim ara' });
    expect(screen.getByRole('alert')).toHaveTextContent('En az 2 karakter gir.');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('İpucu En az 2 karakter gir.');
  });

  it('gönderilince üst bileşenin işleyicisi çağrılır; yazılan değer girdiye geçer', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const { user } = renderUi(
      <SearchBar
        label="Ara"
        submitLabel="Ara"
        onSubmit={onSubmit}
        input={{ name: 'q', defaultValue: 'staj' }}
      />,
    );

    const box = screen.getByRole('searchbox');
    expect(box).toHaveValue('staj');
    expect(box).toHaveAttribute('name', 'q');
    await user.type(box, ' ybs');
    await user.click(screen.getByRole('button', { name: 'Ara' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(box).toHaveValue('staj ybs');
  });

  it('gönderim sürerken "Ara" kilitlenir ve bekliyor olarak duyurulur', () => {
    renderUi(<SearchBar label="Ara" submitLabel="Ara" pending input={{}} />);

    const submit = screen.getByRole('button', { name: /Ara/ });
    expect(submit).toHaveAttribute('aria-busy', 'true');
  });
});
