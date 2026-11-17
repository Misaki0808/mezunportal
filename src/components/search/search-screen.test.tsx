// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { SearchPage } from '@/contracts/search';
import { SearchScreen } from './search-screen';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: router.push }) }));
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

  it('aralık dışı sayfada "henüz yok" ya da "0 sonuç" denmez: bu sayfa boş, ilk sayfaya dön (süzgeç korunur)', () => {
    renderUi(
      <SearchScreen filter={{ q: 'veri analizi' }} results={{ ...empty, page: 5 }} sectors={[]} />,
    );
    expect(screen.getByText('Bu sayfada sonuç yok')).toBeVisible();
    expect(screen.queryByText('Henüz yayınlanmış deneyim yok')).not.toBeInTheDocument();
    expect(screen.queryByText(/Bu filtrelerle/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 sonuç')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'İlk sayfaya dön' })).toHaveAttribute(
      'href',
      '/deneyimler?q=veri+analizi',
    );
  });

  it('aralık dışı sayfada süzgeç yoksa ilk sayfa bağlantısı yalın adrestir', () => {
    renderUi(<SearchScreen filter={{}} results={{ ...empty, page: 3 }} sectors={[]} />);
    expect(screen.getByRole('link', { name: 'İlk sayfaya dön' })).toHaveAttribute(
      'href',
      '/deneyimler',
    );
    expect(screen.queryByText('Henüz yayınlanmış deneyim yok')).not.toBeInTheDocument();
  });
});

describe('hızlı tür yongaları', () => {
  it('tür seçenekleri aç/kapa düğmesidir; seçili olan filtreyle uyumlu, tıklama sayfayı ve aramayı korur', async () => {
    router.push.mockClear();
    const { user } = render({ types: ['INTERNSHIP'], q: 'veri', page: 3 });
    const group = screen.getByRole('group', { name: 'Filtreler' });
    const internship = within(group).getByRole('button', { name: 'Staj' });
    const erasmus = within(group).getByRole('button', { name: 'Erasmus' });
    expect(internship).toHaveAttribute('aria-pressed', 'true');
    expect(erasmus).toHaveAttribute('aria-pressed', 'false');
    // Seçili yonga yazısı tema belirteciyle (koyu temada okunur), sabit beyazla değil.
    expect(internship.className).toContain('text-on-primary');
    expect(internship.className).not.toContain('text-white');
    await user.click(erasmus);
    expect(router.push).toHaveBeenCalledWith('/deneyimler?q=veri&types=ERASMUS&types=INTERNSHIP');
    router.push.mockClear();
    await user.click(internship);
    expect(router.push).toHaveBeenCalledWith('/deneyimler?q=veri');
  });

  it('yazılmış ama gönderilmemiş arama, yonga tıklanınca birlikte uygulanır', async () => {
    router.push.mockClear();
    const { user } = render({});
    await user.type(screen.getByRole('searchbox', { name: 'Deneyim ara' }), 'veri analizi');
    await user.click(
      within(screen.getByRole('group', { name: 'Filtreler' })).getByRole('button', {
        name: 'Staj',
      }),
    );
    expect(router.push).toHaveBeenCalledWith('/deneyimler?q=veri+analizi&types=INTERNSHIP');
  });
});
