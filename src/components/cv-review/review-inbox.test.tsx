// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { ReviewInbox } from './review-inbox';
vi.mock('@/server/actions/cv-review-request', () => ({
  answerCvReviewRequest: vi.fn(),
  listCvReviewRequests: vi.fn(),
  markCvReviewHelpful: vi.fn(),
  saveCvReviewSettings: vi.fn(),
}));
it('mentor ayarı olmayan üyeye boş sayfa yerine açıklama ve tek ayar bağlantısı verir', () => {
  renderUi(<ReviewInbox sent={null} received={null} initialSettings={null} />);
  expect(screen.getByRole('heading', { name: 'CV incelemelerine hazırlan' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Mentor ayarlarını aç' })).toHaveAttribute(
    'href',
    '/mentor/ayarlar',
  );
  expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
});
it('öğrencinin gerçek boş gelen/giden kutusu mentor kurulumuna dönüşmez', () => {
  renderUi(
    <ReviewInbox sent={{ items: [], nextCursor: null }} received={null} initialSettings={null} />,
  );
  expect(screen.queryByRole('link', { name: 'Mentor ayarlarını aç' })).toBeNull();
  expect(screen.getByRole('link', { name: /Mentor bul/ })).toHaveAttribute('href', '/mentorlar');
});
