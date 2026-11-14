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

for (const desktop of [false, true]) {
  for (const mode of ['next', 'only', 'last'] as const) {
    const last = mode !== 'next';
    it(`deneyim kararı: ${desktop ? 'masaüstü' : 'mobil'} görünümde ${mode === 'last' ? 'önceki satır kalsa da başlığa' : last ? 'son kayıt başlığa' : 'sonraki görünür kayda'} odaklanır`, async () => {
      const resolve = vi
        .fn()
        .mockResolvedValue({ ok: true, data: { reportId: experience.id, status: 'DISMISSED' } });
      const next = { ...experience, id: 'next-report', reason: 'İkinci şikâyet' };
      const { user, container } = renderUi(
        <main>
          <AdminReports
            initial={{
              items: mode === 'only' ? [experience] : [experience, next],
              nextCursor: null,
            }}
            list={vi.fn()}
            resolve={resolve}
          />
        </main>,
      );
      // ResponsiveRows aynı kayıtları iki DOM ağacında tutar; Tailwind görünürlüğünü jsdom'da kur.
      const mobile = container.querySelector('ul')!;
      const table = container.querySelector('table')!;
      mobile.style.display = desktop ? 'none' : 'block';
      table.style.display = desktop ? 'table' : 'none';
      await user.click(
        screen.getAllByRole('button', { name: 'Şikâyeti reddet' }).at(mode === 'last' ? -1 : 0)!,
      );
      const dialog = within(screen.getByRole('dialog'));
      await user.type(dialog.getByRole('textbox'), 'İçerik incelendi, ihlal bulunmadı.');
      await user.click(dialog.getByRole('button', { name: 'Onayla' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      if (last) {
        const heading = screen.getByRole('heading', { level: 1, name: 'Şikâyet kuyruğu' });
        expect(heading).toHaveFocus();
        expect(heading).toHaveAttribute('tabindex', '-1');
        heading.blur();
        expect(heading).not.toHaveAttribute('tabindex');
      } else {
        // Sıradaki kaydın ilk karar eylemi, gizli mobil kopya değil.
        expect(screen.getByRole('button', { name: 'Çözüldü olarak işaretle' })).toHaveFocus();
      }
    });
  }
}

it('boş gerekçe hatası, geçerli karardan sonra sıradaki şikâyetin penceresinde kalmaz', async () => {
  const resolve = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { reportId: experience.id, status: 'DISMISSED' } });
  const next = { ...experience, id: 'next-report', reason: 'İkinci şikâyet' };
  const { user } = renderUi(
    <main>
      <AdminReports
        initial={{ items: [experience, next], nextCursor: null }}
        list={vi.fn()}
        resolve={resolve}
      />
    </main>,
  );
  const invalid = 'En az 3 karakterlik bir gerekçe yaz.';
  await user.click(screen.getAllByRole('button', { name: 'Şikâyeti reddet' })[0]!);
  let dialog = within(screen.getByRole('dialog'));
  await user.click(dialog.getByRole('button', { name: 'Onayla' }));
  expect(dialog.getByText(invalid)).toBeVisible();
  expect(resolve).not.toHaveBeenCalled();
  await user.type(dialog.getByRole('textbox'), 'İçerik incelendi, ihlal bulunmadı.');
  await user.click(dialog.getByRole('button', { name: 'Onayla' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(resolve).toHaveBeenCalledTimes(1);
  await user.click(screen.getAllByRole('button', { name: 'Şikâyeti reddet' })[0]!);
  dialog = within(screen.getByRole('dialog'));
  expect(dialog.queryByText(invalid)).toBeNull();
});
