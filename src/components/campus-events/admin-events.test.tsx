// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/server/actions/campus-events', () => ({
  reviewCampusEvent: mocks.review,
  cancelCampusEvent: mocks.cancel,
  createCampusEvent: mocks.create,
}));
import { AdminEvents } from './admin-events';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.review.mockResolvedValue({ ok: true, data: {} });
  mocks.cancel.mockResolvedValue({ ok: true, data: {} });
});
const DEPARTMENTS = [
  { id: '018f0000-0000-7000-8000-0000000000d1', name: 'Yönetim Bilişim Sistemleri' },
];
const EVENTS = [
  {
    id: '018f0000-0000-7000-8000-0000000000e1',
    title: 'CV Atölyesi',
    startsAt: new Date('2026-11-25T11:00:00Z'),
    status: 'PENDING' as const,
  },
  {
    id: '018f0000-0000-7000-8000-0000000000e2',
    title: 'Kariyer Sohbeti',
    startsAt: new Date('2026-11-18T11:00:00Z'),
    status: 'PUBLISHED' as const,
  },
  {
    id: '018f0000-0000-7000-8000-0000000000e3',
    title: 'Staj Buluşması',
    startsAt: new Date('2026-11-19T11:00:00Z'),
    status: 'PENDING' as const,
  },
];
const row = (title: string) => within(screen.getByText(title, { exact: true }).closest('li')!);
describe('AdminEvents karar penceresi', () => {
  it('kaydı ve kararı gösterir; pencere onaylanmadan sunucuya yazmaz', async () => {
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    const d = await screen.findByRole('dialog', { name: 'Onayla' });
    expect(within(d).getByText('CV Atölyesi')).toBeVisible();
    expect(mocks.review).not.toHaveBeenCalled();
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    expect(mocks.review).not.toHaveBeenCalled();
    expect(within(d).getByRole('alert')).toHaveTextContent(
      'Bu işlem için kısa bir gerekçe yazmalısın.',
    );
    expect(within(d).getByLabelText(/İşlem gerekçesi/)).toHaveFocus();
  });
  it('onay gerekçesi sonraki kaydın retine taşınmaz', async () => {
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    let d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Yayımlanmaya uygun');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.review).toHaveBeenCalledWith({
      eventId: EVENTS[0]!.id,
      decision: 'PUBLISH',
      reason: 'Yayımlanmaya uygun',
    });
    await user.click(row('Staj Buluşması').getByRole('button', { name: 'Reddet' }));
    d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText(/İşlem gerekçesi/)).toHaveValue('');
    await user.click(within(d).getByRole('button', { name: 'Reddet' }));
    expect(mocks.review).toHaveBeenCalledTimes(1);
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Tarih ve kapsam eksik');
    await user.click(within(d).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(2));
    expect(mocks.review).toHaveBeenLastCalledWith({
      eventId: EVENTS[2]!.id,
      decision: 'REJECT',
      reason: 'Tarih ve kapsam eksik',
    });
  });
  it('vazgeçilen gerekçeyi diğer kayda veya iptale taşımaz', async () => {
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    let d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'İlk kayıt için');
    await user.click(within(d).getByRole('button', { name: 'Vazgeç' }));
    expect(mocks.review).not.toHaveBeenCalled();
    await user.click(row('Kariyer Sohbeti').getByRole('button', { name: 'Etkinliği iptal et' }));
    d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText(/İşlem gerekçesi/)).toHaveValue('');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Salon kullanılamıyor');
    await user.click(within(d).getByRole('button', { name: 'Etkinliği iptal et' }));
    await waitFor(() =>
      expect(mocks.cancel).toHaveBeenCalledWith({
        eventId: EVENTS[1]!.id,
        reason: 'Salon kullanılamıyor',
      }),
    );
  });
  it('ağ hatasında pencere ve gerekçe korunur; kararlı hata metni gösterir', async () => {
    mocks.review.mockRejectedValue(new Error('ağ'));
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    const d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Uygun bulundu');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    expect(await within(d).findByRole('alert')).not.toHaveTextContent('ağ');
    expect(within(d).getByLabelText(/İşlem gerekçesi/)).toHaveValue('Uygun bulundu');
  });
  it('durum rozetleri ve boş ekran korunur', () => {
    const { unmount } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    expect(row('CV Atölyesi').getByText('İnceleme bekliyor')).toBeVisible();
    expect(row('Kariyer Sohbeti').getByText('Yayında')).toBeVisible();
    expect(screen.getByRole('button', { name: 'İncelemeye gönder' })).toHaveClass(
      'text-on-primary',
    );
    unmount();
    renderUi(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    expect(screen.getByText('İncelenecek etkinlik yok')).toBeVisible();
  });
});

it('yalnız bekleyenleri oluşturma formundan önce gösterir; diğer durumlar ayrı bölümdedir', () => {
  renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
  const pending = screen.getByRole('region', { name: 'Onay bekleyenler' }),
    other = screen.getByRole('region', { name: 'Yayınlanan ve sonuçlananlar' });
  expect(within(pending).getByText('CV Atölyesi')).toBeVisible();
  expect(within(pending).queryByText('Kariyer Sohbeti')).toBeNull();
  expect(within(other).getByText('Kariyer Sohbeti')).toBeVisible();
  const form = screen.getByRole('button', { name: 'İncelemeye gönder' }).closest('form')!;
  expect(pending.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
