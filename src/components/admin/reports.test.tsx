// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { AdminReports } from './reports';

const mocks = vi.hoisted(() => ({ list: vi.fn(), resolve: vi.fn() }));
vi.mock('@/server/actions/job-postings', () => ({
  listJobPostingReports: mocks.list,
  resolveJobPostingReport: mocks.resolve,
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => vi.clearAllMocks());
const job = {
  id: 'r1',
  postingId: 'p1',
  postingTitle: 'Yazılım stajı',
  postingStatus: 'PUBLISHED' as const,
  status: 'OPEN' as const,
  reason: 'Yanıltıcı ilan',
  createdAt: new Date(),
  reviewedAt: null,
  resolutionNote: null,
};
const experience = {
  id: 'e-report',
  status: 'OPEN' as const,
  reason: 'Örnek şikâyet',
  createdAt: new Date(),
  reviewedAt: null,
  resolutionNote: null,
  target: {
    type: 'EXPERIENCE' as const,
    id: 'e1',
    experienceType: 'INTERNSHIP' as const,
    organizationName: 'Örnek kurum',
    isAnonymous: true,
    departmentId: 'd1',
    departmentName: 'Örnek bölüm',
    openReportCount: 1,
  },
};
function renderReports(experiences = false, jobs = false) {
  return renderUi(
    <main>
      <AdminReports
        initial={{ items: experiences ? [experience] : [], nextCursor: null }}
        jobReports={{ items: jobs ? [job] : [], nextCursor: null }}
        list={vi.fn()}
        resolve={vi.fn()}
      />
    </main>,
  );
}
it('ilan şikâyeti varken boş mesaj yalnız deneyim bölümünü anlatır', () => {
  renderReports(false, true);
  expect(screen.getByRole('heading', { name: 'Deneyim şikâyetleri' })).toBeVisible();
  expect(screen.getByText('Açık deneyim şikâyeti yok.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'İlan şikâyetleri' })).toBeVisible();
  expect(screen.getByText(job.postingTitle)).toBeVisible();
  expect(screen.queryByText('Henüz kayıt yok.')).toBeNull();
  expect(screen.queryByText('Açık şikâyet yok.')).toBeNull();
});
it('iki kuyruk da boşken tek sakin boş durum vardır', () => {
  renderReports();
  expect(screen.getAllByText('Açık şikâyet yok.')).toHaveLength(1);
  expect(screen.queryByText('Açık deneyim şikâyeti yok.')).toBeNull();
  expect(screen.queryByText('Açık ilan şikâyeti yok.')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'İlan şikâyetleri' })).toBeNull();
});
it('deneyim şikâyeti varken ilan bölümünün kendi boş durumu görünür', () => {
  renderReports(true, false);
  expect(screen.getByText('Açık ilan şikâyeti yok.')).toBeVisible();
  expect(screen.queryByText('Açık şikâyet yok.')).toBeNull();
});
it('son ilan kararı sonrası tek boş duruma geçer ve odak sayfa başlığına döner', async () => {
  mocks.resolve.mockResolvedValueOnce({
    ok: true,
    data: { reportId: job.id, status: 'DISMISSED' },
  });
  renderReports(false, true);
  fireEvent.click(screen.getByRole('button', { name: 'Şikâyeti yoksay' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Karar gerekçesi/), {
    target: { value: 'İlan bilgileri doğrulandı.' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
  await waitFor(() => expect(screen.getAllByText('Açık şikâyet yok.')).toHaveLength(1));
  expect(screen.queryByText('Açık ilan şikâyeti yok.')).toBeNull();
  expect(screen.getByRole('heading', { level: 1, name: 'Şikâyet kuyruğu' })).toHaveFocus();
});

it('iki kuyruk doluyken boş mesaj göstermez', () => {
  renderReports(true, true);
  for (const text of [
    'Açık şikâyet yok.',
    'Açık deneyim şikâyeti yok.',
    'Açık ilan şikâyeti yok.',
  ]) {
    expect(screen.queryByText(text)).toBeNull();
  }
});
it('son karar sonrası eski sayfalama imleci de tükenince tek boş duruma geçer', async () => {
  mocks.resolve.mockResolvedValueOnce({
    ok: true,
    data: { reportId: job.id, status: 'DISMISSED' },
  });
  mocks.list.mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: null } });
  renderUi(
    <main>
      <AdminReports
        initial={{ items: [], nextCursor: null }}
        jobReports={{ items: [job], nextCursor: 'older' }}
        list={vi.fn()}
        resolve={vi.fn()}
      />
    </main>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Şikâyeti yoksay' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Karar gerekçesi/), {
    target: { value: 'İlan bilgileri doğrulandı.' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
  await waitFor(() => expect(screen.queryByText(job.postingTitle)).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Daha fazla göster' }));
  await waitFor(() => expect(screen.getAllByText('Açık şikâyet yok.')).toHaveLength(1));
});
