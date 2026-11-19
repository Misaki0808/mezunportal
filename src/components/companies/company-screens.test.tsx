// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { CompaniesIndex } from './company-screens';

const none = { companies: [], popular: [], page: 1, total: 0, pageSize: 40 };

describe('şirketler: boş durum', () => {
  it('arama yokken "bulunamadı" değil "henüz yok": gizlilik eşiği açıkça yazılır, tek eylem deneyim yazmaktır', () => {
    renderUi(<CompaniesIndex data={none} query="" />);
    expect(screen.getByText('Henüz şirket sayfası yok')).toBeVisible();
    expect(screen.getByText(/en az üç farklı kişinin deneyimi/)).toBeVisible();
    expect(screen.queryByText('Şirket bulunamadı')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deneyim yaz' })).toHaveAttribute(
      'href',
      '/deneyim/yeni',
    );
  });

  it('arama sözcüğü varken eski "bulunamadı" ve yazım ipucu korunur', () => {
    renderUi(<CompaniesIndex data={none} query="xyz" />);
    expect(screen.getByText('Şirket bulunamadı')).toBeVisible();
    expect(screen.getByText('Başka bir ad veya yazım deneyebilirsin.')).toBeVisible();
    expect(screen.queryByText('Henüz şirket sayfası yok')).not.toBeInTheDocument();
  });
});

describe('şirketler: ortak başlık (kart 424)', () => {
  it('mülakat ve takvim bağlantıları başlığın eylem alanındadır', () => {
    renderUi(<CompaniesIndex data={none} query="" />);
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(header).getByRole('link', { name: 'Mülakat sorularına bak' })).toHaveAttribute(
      'href',
      '/mulakat-sorulari',
    );
    expect(within(header).getByRole('link', { name: 'Başvuru takvimine bak' })).toHaveAttribute(
      'href',
      '/basvuru-takvimi',
    );
  });
});

describe('şirketler: sayfalama', () => {
  const company = (n: number) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    slug: `sirket-${n}`,
    name: `Şirket ${n}`,
    sector: null,
  });
  it('arama ve sayfa birlikte korunur; ilk sayfada "Önceki" bağlantısı yoktur', () => {
    renderUi(
      <CompaniesIndex
        data={{
          companies: [company(1), company(2)],
          popular: [],
          page: 2,
          total: 100,
          pageSize: 40,
        }}
        query="yazılım"
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Sayfalama' });
    expect(within(nav).getByRole('link', { name: /Sonraki/ })).toHaveAttribute(
      'href',
      '/sirketler?q=yaz%C4%B1l%C4%B1m&page=3',
    );
    expect(within(nav).getByRole('link', { name: /Önceki/ })).toHaveAttribute(
      'href',
      '/sirketler?q=yaz%C4%B1l%C4%B1m',
    );
  });
  it('tek sayfalık sonuçta sayfalama görünmez', () => {
    renderUi(
      <CompaniesIndex
        data={{ companies: [company(1)], popular: [], page: 1, total: 1, pageSize: 40 }}
        query=""
      />,
    );
    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });
});
