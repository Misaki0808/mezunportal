// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { ReviewInbox } from './review-inbox';
import { RequestForm } from './request-form';
vi.mock('@/server/actions/cv-review-request', () => ({
  createCvReviewRequest: vi.fn(),
  answerCvReviewRequest: vi.fn(),
  listCvReviewRequests: vi.fn(),
  markCvReviewHelpful: vi.fn(),
  saveCvReviewSettings: vi.fn(),
}));
it('CV inceleme talebinde boş notun hatası alana bağlanır ve odaklanır', async () => {
  const { user } = renderUi(
    <RequestForm mentorId="mentor-1" availability={{ available: true, reason: null }} />,
  );
  await user.click(screen.getByRole('button', { name: /gönder/i }));
  const note = screen.getByRole('textbox');
  expect(note).toHaveFocus();
  expect(note).toBeInvalid();
  expect(note).toHaveAccessibleDescription();
});
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
it('ortak hesap çerçevesinde: HESAP üst etiketi, tek h1 ve hesap ayarlarına dönüş (kart 407)', () => {
  renderUi(
    <ReviewInbox sent={{ items: [], nextCursor: null }} received={null} initialSettings={null} />,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'CV incelemeleri' })).toBeVisible();
  expect(screen.getByText('HESAP')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Hesap ayarları' })).toHaveAttribute('href', '/hesap');
});
