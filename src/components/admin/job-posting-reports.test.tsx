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

it.each(['cancel', 'dismiss'] as const)(
  '%s sonrasında başka kaydın gerekçesi boş başlar',
  (exit) => {
    vi.clearAllMocks();
    const row = {
      postingStatus: 'PUBLISHED' as const,
      reason: 'Yanıltıcı ilan',
      status: 'OPEN' as const,
      createdAt: new Date(),
      reviewedAt: null,
      resolutionNote: null,
    };
    renderUi(
      <JobPostingReports
        initial={{
          items: [
            { ...row, id: 'r1', postingId: 'p1', postingTitle: 'İlk ilan' },
            { ...row, id: 'r2', postingId: 'p2', postingTitle: 'İkinci ilan' },
          ],
          nextCursor: null,
        }}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'İlanı kaldır' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Karar gerekçesi/), {
      target: { value: 'Yalnız ilk ilana ait gerekçe' },
    });
    if (exit === 'cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    else fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'İlanı kaldır' }));
    expect(within(screen.getByRole('dialog')).getByLabelText(/Karar gerekçesi/)).toHaveValue('');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    expect(mocks.resolve).not.toHaveBeenCalled();
  },
);

it.each(['DISMISS', 'TAKE_DOWN'] as const)(
  'B2: %s kararı kaldırılan diğer şikâyetleri atlar ve son kayıtta başlığa döner',
  async (decision) => {
    mocks.resolve
      .mockReset()
      .mockResolvedValue({ ok: true, data: { reportId: 'r1', status: 'RESOLVED' } });
    const row = {
      postingStatus: 'PUBLISHED' as const,
      reason: 'Yanıltıcı ilan',
      status: 'OPEN' as const,
      createdAt: new Date(),
      reviewedAt: null,
      resolutionNote: null,
    };
    const { user } = renderUi(
      <JobPostingReports
        initial={{
          items: [
            { ...row, id: 'r1', postingId: 'p1', postingTitle: 'İlk ilan' },
            ...(decision === 'TAKE_DOWN'
              ? [{ ...row, id: 'r2', postingId: 'p1', postingTitle: 'İlk ilanın diğer şikâyeti' }]
              : []),
            { ...row, id: 'r3', postingId: 'p3', postingTitle: 'Son ilan' },
          ],
          nextCursor: null,
        }}
      />,
    );
    const action = decision === 'DISMISS' ? 'Şikâyeti yoksay' : 'İlanı kaldır';
    await user.click(screen.getAllByRole('button', { name: action })[0]!);
    await user.type(screen.getByLabelText(/Karar gerekçesi/), 'İnceleme tamamlandı');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Şikâyeti yoksay' })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Şikâyeti yoksay' }));
    await user.type(screen.getByLabelText(/Karar gerekçesi/), 'Son karar gerekçesi');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Onayla' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'İlan şikâyetleri' })).toHaveFocus(),
    );
  },
);
