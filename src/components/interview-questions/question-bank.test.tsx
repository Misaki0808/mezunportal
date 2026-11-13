// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import { QuestionBank } from './question-bank';

it('güvenli şirket toplamını gösterir, sayfalarken arama ve sektörü korur', () => {
  renderUi(
    <QuestionBank
      filters={{ companyId: '', sectorId: 'sektor', q: 'veri analizi' }}
      data={{
        companies: [],
        sectors: [],
        insufficient: false,
        total: 11,
        page: 1,
        pageSize: 10,
        groups: [
          {
            companyId: 'a',
            companyName: 'Örnek',
            companySlug: 'ornek',
            sector: null,
            questions: [{ text: 'SQL nedir?', count: 3, category: 'QUESTION' }],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('11 şirketten soru bulundu.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Sonraki' })).toHaveAttribute(
    'href',
    '/mulakat-sorulari?sectorId=sektor&q=veri+analizi&page=2',
  );
});

it('kayıt yokken sıfır sayaç yazmaz; gizlilik eşiğini ve tek eylemi söyler', () => {
  renderUi(
    <QuestionBank
      filters={{ companyId: '', sectorId: '', q: '' }}
      data={{
        companies: [],
        sectors: [],
        insufficient: false,
        total: 0,
        page: 1,
        pageSize: 10,
        groups: [],
      }}
    />,
  );
  expect(screen.queryByText(/şirketten soru bulundu/)).not.toBeInTheDocument();
  expect(screen.getByText('Henüz gösterilebilecek soru yok.')).toBeVisible();
  expect(screen.getByText(/en az üç farklı kişinin deneyiminde geçince/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Deneyim paylaş' })).toHaveAttribute(
    'href',
    '/deneyim/yeni',
  );
});

const bank = (over: Partial<Parameters<typeof QuestionBank>[0]['data']> = {}) => ({
  companies: [],
  sectors: [],
  insufficient: false,
  total: 0,
  page: 1,
  pageSize: 10,
  groups: [],
  ...over,
});

it('süzgeçle eşleşme yokken "henüz yok"/gizlilik değil arama dili: tek eylem süzgeci temizlemek', () => {
  renderUi(<QuestionBank filters={{ companyId: '', sectorId: '', q: 'xyz' }} data={bank()} />);
  expect(screen.getByText('Bu seçimle eşleşen soru yok')).toBeVisible();
  expect(screen.queryByText('Henüz gösterilebilecek soru yok.')).not.toBeInTheDocument();
  expect(screen.queryByText(/en az üç farklı kişinin/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Filtreleri temizle' })).toHaveAttribute(
    'href',
    '/mulakat-sorulari',
  );
  expect(screen.queryByRole('link', { name: 'Deneyim paylaş' })).not.toBeInTheDocument();
});

it.each([
  { companyId: 'a', sectorId: '', q: '' },
  { companyId: '', sectorId: '', q: 'mülakat' },
])(
  'süzgeçli ve seçim gizlilik eşiğinin altındaysa arama dili ile gizlilik gerekçesi birlikte söylenir, eylem süzgeci temizlemektir: %o',
  (filters) => {
    renderUi(<QuestionBank filters={filters} data={bank({ insufficient: true })} />);
    expect(screen.getByText('Bu seçimle eşleşen soru yok')).toBeVisible();
    expect(screen.getByText(/en az üç farklı kişinin/)).toBeVisible();
    // Metin sayı ya da "şu şirkette az deneyim var" gibi bir şey söylemez (gizlilik).
    expect(screen.queryByText(/az sayıda deneyim/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Filtreleri temizle' })).toHaveAttribute(
      'href',
      '/mulakat-sorulari',
    );
    expect(screen.queryByRole('link', { name: 'Deneyim paylaş' })).not.toBeInTheDocument();
  },
);

it('süzgeçsiz ama gizlilik eşiğinin altında kalan şirket varsa bugünkü gizlilik boş durumu ve "Deneyim paylaş" kalır', () => {
  renderUi(
    <QuestionBank
      filters={{ companyId: '', sectorId: '', q: '' }}
      data={bank({ insufficient: true })}
    />,
  );
  expect(screen.getByText('Bu seçim için az sayıda deneyim var.')).toBeVisible();
  expect(screen.getByText(/en az üç farklı kişinin/)).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Filtreleri temizle' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Deneyim paylaş' })).toHaveAttribute(
    'href',
    '/deneyim/yeni',
  );
});

it('aralık dışı sayfada toplam sayı ile "henüz yok" çelişmez: bu sayfa boş, ilk sayfaya dön', () => {
  renderUi(
    <QuestionBank
      filters={{ companyId: '', sectorId: 'sektor', q: 'veri' }}
      data={bank({ total: 12, page: 5 })}
    />,
  );
  expect(screen.getByText('12 şirketten soru bulundu.')).toBeVisible();
  expect(screen.getByText('Bu sayfada soru yok')).toBeVisible();
  expect(screen.queryByText('Henüz gösterilebilecek soru yok.')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'İlk sayfaya dön' })).toHaveAttribute(
    'href',
    '/mulakat-sorulari?sectorId=sektor&q=veri&page=1',
  );
});
