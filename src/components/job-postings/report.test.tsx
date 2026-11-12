// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderWithToasts } from '@/test/render';
import { ReportPosting } from './report';

const mocks = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('@/server/actions/job-postings', () => ({ reportJobPosting: mocks.report }));
beforeEach(() => vi.clearAllMocks());
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
  renderWithToasts(<ReportPosting postingId="ilan-1" />);
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
  expect((await screen.findAllByText('Şikâyetin alındı. Teşekkürler.')).length).toBeGreaterThan(0);
});

it('yinelenen şikâyette sunucunun kararlı kodunu gösterir', async () => {
  mocks.report.mockResolvedValueOnce({ ok: false, errorCode: 'REPORT_ALREADY_OPEN' });
  renderWithToasts(<ReportPosting postingId="ilan-2" />);
  fireEvent.click(screen.getByRole('button', { name: 'Bu ilanı şikâyet et' }));
  fireEvent.click(screen.getByRole('button', { name: 'Şikâyeti gönder' }));
  expect(await screen.findByText('Bu içerik için daha önce şikâyet gönderdin.')).toBeVisible();
});

it('ilan şikâyetinde çift tıklama tek istek, ağ hatasında açıklama korunur', async () => {
  const gate = Promise.withResolvers<never>();
  mocks.report.mockReturnValueOnce(gate.promise);
  renderWithToasts(<ReportPosting postingId="ilan-3" />);
  fireEvent.click(screen.getByRole('button', { name: 'Bu ilanı şikâyet et' }));
  const dialog = screen.getByRole('dialog');
  const details = within(dialog).getByLabelText('Açıklama (isteğe bağlı)');
  fireEvent.change(details, { target: { value: 'Korunan açıklama' } });
  const button = within(dialog).getByRole('button', { name: 'Şikâyeti gönder' });
  act(() => {
    button.click();
    button.click();
  });
  expect(mocks.report).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute('aria-busy', 'true');
  await act(async () => gate.reject(new Error('ağ')));
  expect(details).toHaveValue('Korunan açıklama');
  expect(within(dialog).getByText(/Beklenmeyen bir sorun/)).toBeVisible();
});
