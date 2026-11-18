// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { ReviewInbox } from './review-inbox';
import { RequestForm } from './request-form';
import type { CvReviewRequestView } from '@/contracts/cv-review-request';
import { answerCvReviewRequest } from '@/server/actions/cv-review-request';
import { saveCvReviewSettings } from '@/server/actions/cv-review-request';
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
it('CV inceleme yanıtında boş yorum ilgili alanda gösterilir ve odaklanır', async () => {
  const row = {
    id: 'request-1',
    role: 'MENTOR',
    status: 'OPEN',
    counterpart: { userId: 'student-1', displayName: 'Deniz' },
    note: 'CV gözden geçirme',
    comment: null,
    helpfulAt: null,
    actions: { canAnswer: true, canMarkHelpful: false, canViewCv: false },
  } as unknown as CvReviewRequestView;
  const { user } = renderUi(
    <ReviewInbox
      sent={null}
      received={{ items: [row], nextCursor: null }}
      initialSettings={null}
    />,
  );
  await user.click(screen.getByRole('button', { name: /yorumu gönder/i }));
  const comment = screen.getByRole('textbox');
  expect(comment).toHaveFocus();
  expect(comment).toBeInvalid();
  expect(comment).toHaveAccessibleDescription();
  vi.mocked(answerCvReviewRequest).mockResolvedValueOnce({
    ok: false,
    errorCode: 'VALIDATION_INVALID',
    fieldErrors: { comment: 'VALIDATION_INVALID' },
  });
  await user.type(comment, 'Korunacak yorum');
  await user.click(screen.getByRole('button', { name: /yorumu gönder/i }));
  await waitFor(() => expect(comment).toBeInvalid());
  expect(comment).toHaveFocus();
  expect(comment).toHaveValue('Korunacak yorum');
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
it('CV aylık sınırı boş veya 101 iken sıfıra dönüştürülüp kaydedilmez', async () => {
  const { user } = renderUi(
    <ReviewInbox
      sent={null}
      received={null}
      initialSettings={{ enabled: true, monthlyLimit: 3 }}
    />,
  );
  const limit = screen.getByRole('spinbutton');
  await user.clear(limit);
  await user.click(screen.getByRole('button', { name: 'Tercihleri kaydet' }));
  expect(saveCvReviewSettings).not.toHaveBeenCalled();
  expect(limit).toHaveFocus();
  expect(limit).toBeInvalid();
  expect(limit).toHaveValue(null);
  await user.type(limit, '101');
  await user.click(screen.getByRole('button', { name: 'Tercihleri kaydet' }));
  expect(saveCvReviewSettings).not.toHaveBeenCalled();
  expect(limit).toHaveValue(101);
  expect(limit).toHaveFocus();
  vi.mocked(saveCvReviewSettings).mockResolvedValueOnce({
    ok: true,
    data: { enabled: true, monthlyLimit: 0 },
  });
  await user.clear(limit);
  await user.type(limit, '0');
  await user.click(screen.getByRole('button', { name: 'Tercihleri kaydet' }));
  await waitFor(() =>
    expect(saveCvReviewSettings).toHaveBeenCalledWith({ enabled: true, monthlyLimit: 0 }),
  );
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
