// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { JobPostingReports } from './job-posting-reports';
const mocks = vi.hoisted(() => ({ list: vi.fn(), resolve: vi.fn() }));
vi.mock('@/server/actions/job-postings', () => ({
  listJobPostingReports: mocks.list,
  resolveJobPostingReport: mocks.resolve,
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
it('ilanı kaldırmadan önce gerekçe ister ve kararı rapor kimliğiyle gönderir', async () => {
  mocks.resolve.mockResolvedValueOnce({ ok: true, data: { reportId: 'r1', status: 'RESOLVED' } });
  renderUi(
    <JobPostingReports
      initial={{
        items: [
          {
            id: 'r1',
            postingId: 'p1',
            postingTitle: 'Örnek staj',
            postingStatus: 'PUBLISHED',
            reason: 'Yanıltıcı ilan',
            status: 'OPEN',
            createdAt: new Date(),
            reviewedAt: null,
            resolutionNote: null,
          },
        ],
        nextCursor: null,
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'İlanı kaldır' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
  expect(mocks.resolve).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByLabelText(/Karar gerekçesi/), {
    target: { value: 'Yanıltıcı olduğu doğrulandı' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
  await waitFor(() =>
    expect(mocks.resolve).toHaveBeenCalledWith({
      reportId: 'r1',
      decision: 'TAKE_DOWN',
      reason: 'Yanıltıcı olduğu doğrulandı',
    }),
  );
  expect(await screen.findByText('Açık ilan şikâyeti yok.')).toBeVisible();
});
