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

  it('gönderim sürerken "Ara" GERÇEKTEN kilitlenir (disabled + aria-busy); sebep ekran okuyucuya açıklama olur', () => {
    renderUi(
      <SearchBar label="Ara" submitLabel="Ara" pendingReason="Deneyimler yükleniyor" input={{}} />,
    );

    const submit = screen.getByRole('button', { name: /Ara/ });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toHaveAccessibleDescription('Deneyimler yükleniyor');
    // Sebep satırı kaplamaz: görünür bir metin değil, ekran okuyucuya özel.
    expect(screen.getByText('Deneyimler yükleniyor')).toHaveClass('sr-only');
  });

  it('dış boşluk çağırandan gelir (bileşen marj koymaz)', () => {
    renderUi(<SearchBar label="Ara" submitLabel="Ara" className="mb-4" input={{}} />);

    const form = screen.getByRole('search');
    expect(form).toHaveClass('mb-4');
    expect(form).not.toHaveClass('mt-6');
  });

  it('satır sarabilir; girdi varsayılanda en az 7,5 rem kalır, uzamış satır sonu öğesinde en az 10 rem', () => {
    const { unmount } = renderUi(
      <SearchBar
        label="Ara"
        submitLabel="Ara"
        trailing={<Button variant="secondary">Filtreler</Button>}
        input={{}}
      />,
    );
    // Filtre yokken alt sınır 7,5 rem (120 px): 360 px'te girdi 127-135 px, satır tek kalır; 320 px'te (87-95 px) düğme alt satıra iner.
    // 10 rem olsaydı 360 px'te de alt satıra inip ilk ekrandaki sonuçları kaydırırdı.
    expect(screen.getByRole('searchbox').parentElement).toHaveClass('flex-wrap');
    expect(screen.getByRole('searchbox')).toHaveClass('min-w-30', 'flex-1');
    expect(screen.getByRole('searchbox')).not.toHaveClass('min-w-0', 'min-w-40');
    unmount();

    renderUi(
      <SearchBar
        label="Ara"
        submitLabel="Ara"
        wideTrailing
        trailing={<Button variant="secondary">Filtreler (3)</Button>}
        input={{}}
      />,
    );
    // "Filtreler (3)" ile girdi 360 px'te 105 px'e düşüyordu: alt sınır 160 px, sığmayan düğme alt satıra iner.
    expect(screen.getByRole('searchbox')).toHaveClass('min-w-40', 'flex-1');
    expect(screen.getByRole('searchbox')).not.toHaveClass('min-w-30');
  });

  it('children aynı formun içinde, arama satırının altına girer (süzgeç alanları q ile birlikte gider)', () => {
    renderUi(
      <SearchBar label="Ara" submitLabel="Ara" input={{ name: 'q' }}>
        <details>
          <summary>Filtreler</summary>
          <select aria-label="Tür" name="kind" />
        </details>
      </SearchBar>,
    );

    const form = screen.getByRole('search');
    const box = screen.getByRole('searchbox');
    const select = screen.getByLabelText('Tür');
    expect(form).toContainElement(select);
    expect(box.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.parentElement).not.toContainElement(select);
  });

  it('GET gönderiminde boş alanlar adrese girmez (formdata dinleyicisi bağlı); form hazır olunca işaretlenir', () => {
    renderUi(
      <SearchBar label="Ara" submitLabel="Ara" input={{ name: 'q' }}>
        <select aria-label="Tür" name="kind" defaultValue="" />
      </SearchBar>,
    );

    const form = screen.getByRole('search');
    // jsdom `formdata` olayını kendisi tetiklemez: olayı elle gönderiyoruz (gerçek tarayıcı: e2e `search-boundaries`).
    const formData = new FormData();
    formData.append('q', 'ornek');
    formData.append('kind', '');
    form.dispatchEvent(Object.assign(new Event('formdata'), { formData }));

    expect([...formData.entries()]).toEqual([['q', 'ornek']]);
    expect(form).toHaveAttribute('data-hydrated', 'true');
  });

  it('gönderim sürmüyorken "Ara" kilitli değildir', () => {
    renderUi(<SearchBar label="Ara" submitLabel="Ara" input={{}} />);

    const submit = screen.getByRole('button', { name: 'Ara' });
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute('aria-busy', 'true');
  });
});
