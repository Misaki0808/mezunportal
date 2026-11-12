// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { ReportPosting } from './report';

const mocks = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('@/server/actions/job-postings', () => ({ reportJobPosting: mocks.report }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

it('seçili neden ve isteğe bağlı açıklama yalnız ilan kimliğiyle gönderilir', async () => {
  mocks.report.mockResolvedValueOnce({ ok: true, data: { reportId: 'r', status: 'OPEN' } });
  renderUi(<ReportPosting postingId="ilan-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Bu ilanı şikâyet et' }));
  fireEvent.change(screen.getByLabelText('Şikâyet nedeni'), {
    target: { value: 'reportInappropriate' },
  });
  fireEvent.change(screen.getByLabelText('Açıklama (isteğe bağlı)'), {
    target: { value: 'Uygun değil' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Şikâyeti gönder' }));
  await waitFor(() =>
    expect(mocks.report).toHaveBeenCalledWith({
      postingId: 'ilan-1',
      reason: 'Uygunsuz içerik: Uygun değil',
    }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Şikâyetin alındı');
});

it('yinelenen şikâyette sunucunun kararlı kodunu gösterir', async () => {
  mocks.report.mockResolvedValueOnce({ ok: false, errorCode: 'REPORT_ALREADY_OPEN' });
  renderUi(<ReportPosting postingId="ilan-2" />);
  fireEvent.click(screen.getByRole('button', { name: 'Bu ilanı şikâyet et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Şikâyeti gönder' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Bu içerik için daha önce şikâyet gönderdin.',
  );
});
