// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { FilterShell } from './filter-shell';
import { SearchBar } from './search-bar';

// jsdom'da <dialog>.showModal/close yok; açık/kapalı niteliği taklit edilir (dialog.test.tsx ile aynı).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

function shell(over: Partial<React.ComponentProps<typeof FilterShell>> = {}) {
  return (
    <FilterShell
      active={[]}
      total={3}
      onApply={() => true}
      onReset={() => undefined}
      onClear={() => undefined}
      results={<p>Sonuç listesi</p>}
      {...over}
    >
      <p>Filtre alanları</p>
    </FilterShell>
  );
}

describe('FilterShell', () => {
  it('arama satırı verilirse telefondaki "Filtreler" düğmesi arama satırına girer: [ara] [Ara] [Filtreler] tek satır', () => {
    renderUi(
      shell({
        search: (filtersButton) => (
          <SearchBar label="Deneyim ara" submitLabel="Ara" trailing={filtersButton} input={{}} />
        ),
      }),
    );

    const box = screen.getByRole('searchbox', { name: 'Deneyim ara' });
    const filters = screen.getAllByRole('button', { name: 'Filtreler' })[0]!;
    expect(box.parentElement).toBe(filters.parentElement);
    expect(box.parentElement).toBe(screen.getByRole('button', { name: 'Ara' }).parentElement);
    // Yalnız telefonda: ≥ lg'de filtreler kenar panelidir, düğme gizlenir.
    expect(filters).toHaveClass('lg:hidden');
  });

  it('düğme etkin filtre sayısını taşır ve tıklanınca filtre alt sayfasını açar', async () => {
    const { user } = renderUi(
      shell({
        active: [
          { key: 'a', label: 'Staj', onRemove: () => undefined },
          { key: 'b', label: '2025', onRemove: () => undefined },
        ],
        search: (filtersButton) => (
          <SearchBar label="Ara" submitLabel="Ara" trailing={filtersButton} input={{}} />
        ),
      }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtreler (2)' }));

    expect(await screen.findByRole('dialog', { name: 'Filtreler' })).toBeVisible();
  });

  it('alt sayfadan vazgeçince taslak seçimler geri alınır (onReset)', async () => {
    const onReset = vi.fn();
    const { user } = renderUi(
      shell({
        onReset,
        search: (filtersButton) => (
          <SearchBar label="Ara" submitLabel="Ara" trailing={filtersButton} input={{}} />
        ),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Filtreler' }));
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('arama satırı verilmezse (mentor dizini) düğme kendi satırında kalır ve yalnız telefonda görünür', () => {
    renderUi(shell());

    const filters = screen.getAllByRole('button', { name: 'Filtreler' })[0]!;
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(filters.parentElement).toHaveClass('mt-6', 'lg:hidden');
  });
});
