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
