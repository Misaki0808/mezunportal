// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { CompaniesIndex } from './company-screens';

const none = { companies: [], popular: [] };

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
