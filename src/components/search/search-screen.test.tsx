// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { SearchPage } from '@/contracts/search';
import { SearchScreen } from './search-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const empty: SearchPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  hasMore: false,
  sort: 'NEWEST',
};
const render = (filter: Parameters<typeof SearchScreen>[0]['filter']) =>
  renderUi(<SearchScreen filter={filter} results={empty} sectors={[]} />);

describe('deneyim araması: boş durum', () => {
  it('filtre ve arama yokken "filtre" dili yok: henüz kimse paylaşmadı, tek eylem, sıfır sayaç yok', () => {
    render({});
    expect(screen.getByText('Henüz yayınlanmış deneyim yok')).toBeVisible();
    expect(screen.queryByText(/Bu filtrelerle/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 sonuç')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filtreleri temizle' })).not.toBeInTheDocument();
    // Boş durumdaki tek eylem: ilk deneyimi yaz (üstteki "Deneyimlerim"/"Şirketlere bak" sayfa başlığındadır).
    const write = screen.getAllByRole('link', { name: 'Deneyim yaz' });
    expect(write).toHaveLength(1);
    expect(write[0]).toHaveAttribute('href', '/deneyim/yeni');
  });

  it('arama sözcüğü varken filtre dili, sayaç ve temizleme korunur', () => {
    render({ q: 'veri analizi' });
    expect(screen.getByText('Bu filtrelerle deneyim bulunamadı')).toBeVisible();
    expect(screen.getByText('0 sonuç')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Filtreleri temizle' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Henüz yayınlanmış deneyim yok')).not.toBeInTheDocument();
  });

  it('filtre varken de filtre dili ve sayaç korunur', () => {
    render({ types: ['INTERNSHIP'] });
    expect(screen.getByText('Bu filtrelerle deneyim bulunamadı')).toBeVisible();
    expect(screen.getByText('0 sonuç')).toBeVisible();
  });
});
