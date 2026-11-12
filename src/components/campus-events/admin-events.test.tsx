// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/tr.json';
import { renderWithToasts } from '@/test/render';
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
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
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
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
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
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
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
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    const d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Uygun bulundu');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    expect(await within(d).findByRole('alert')).not.toHaveTextContent('ağ');
    expect(within(d).getByLabelText(/İşlem gerekçesi/)).toHaveValue('Uygun bulundu');
  });
  it('durum rozetleri ve boş ekran korunur', () => {
    const { unmount } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    expect(row('CV Atölyesi').getByText('İnceleme bekliyor')).toBeVisible();
    expect(row('Kariyer Sohbeti').getByText('Yayında')).toBeVisible();
    expect(screen.getByRole('button', { name: 'İncelemeye gönder' })).toHaveClass(
      'text-on-primary',
    );
    unmount();
    renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    expect(screen.getByText('İncelenecek etkinlik yok')).toBeVisible();
  });
});

it('yalnız bekleyenleri oluşturma formundan önce gösterir; diğer durumlar ayrı bölümdedir', () => {
  renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
  const pending = screen.getByRole('region', { name: 'Onay bekleyenler' }),
    other = screen.getByRole('region', { name: 'Yayınlanan ve sonuçlananlar' });
  expect(within(pending).getByText('CV Atölyesi')).toBeVisible();
  expect(within(pending).queryByText('Kariyer Sohbeti')).toBeNull();
  expect(within(other).getByText('Kariyer Sohbeti')).toBeVisible();
  const form = screen.getByRole('button', { name: 'İncelemeye gönder' }).closest('form')!;
  expect(pending.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('katılım bağlantısının erişilebilir adı etkinliği ayırt eder', () => {
  renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
  const link = screen.getByRole('link', { name: 'Katılım ekranı: Kariyer Sohbeti' });
  expect(link).toHaveTextContent('Katılım ekranı');
  expect(link).toHaveAttribute('href', '/yonetim/etkinlikler/' + EVENTS[1]!.id);
});

describe('AdminEvents: geri bildirim kalıbı (kart 207)', () => {
  it('karar başarılı: pencere kapanır, toast gösterilir, sonraki karar gerekçesiz açılır', async () => {
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    const d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Yayımlanmaya uygun');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Etkinlik yayınlandı.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.refresh).toHaveBeenCalled();
    await user.click(row('Staj Buluşması').getByRole('button', { name: 'Reddet' }));
    expect(within(await screen.findByRole('dialog')).getByLabelText(/İşlem gerekçesi/)).toHaveValue(
      '',
    );
  });

  it('iptal başarılı: bağlama uygun toast verir', async () => {
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('Kariyer Sohbeti').getByRole('button', { name: 'Etkinliği iptal et' }));
    const d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Salon kullanılamıyor');
    await user.click(within(d).getByRole('button', { name: 'Etkinliği iptal et' }));
    expect(await screen.findByText('Etkinlik iptal edildi.')).toBeVisible();
  });

  it('ağ hatasında kararlı metin pencerede gösterilir, toast yok; yeniden denenince başarır', async () => {
    mocks.review.mockRejectedValueOnce(new Error('ağ'));
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    const d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Uygun bulundu');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    expect(await within(d).findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeVisible();
    expect(screen.queryByText('Etkinlik yayınlandı.')).toBeNull();
    expect(within(d).getByLabelText(/İşlem gerekçesi/)).toHaveValue('Uygun bulundu');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Etkinlik yayınlandı.')).toBeVisible();
    expect(mocks.review).toHaveBeenCalledTimes(2);
  });

  it('pencere kapatılıp yeniden açılınca önceki hata görünmez', async () => {
    mocks.review.mockRejectedValueOnce(new Error('ağ'));
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    let d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText(/İşlem gerekçesi/), 'Uygun bulundu');
    await user.click(within(d).getByRole('button', { name: 'Onayla' }));
    await within(d).findByText(messages.errors.codes.SERVER_UNEXPECTED);
    await user.click(within(d).getByRole('button', { name: 'Vazgeç' }));
    await user.click(row('CV Atölyesi').getByRole('button', { name: 'Onayla' }));
    d = await screen.findByRole('dialog');
    expect(within(d).queryByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeNull();
  });

  it('tarih alanları boşken ne olduğunu söyleyen ipucu taşır', () => {
    renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    expect(screen.getByLabelText(/Başlangıç/)).toHaveAccessibleDescription(
      messages.campusEvents.dateTimeHint,
    );
    expect(screen.getByLabelText(/Bitiş/)).toHaveAccessibleDescription(
      messages.campusEvents.dateTimeHint,
    );
  });

  async function fillCreateForm(user: ReturnType<typeof renderWithToasts>['user']) {
    await user.type(screen.getByLabelText(/Etkinlik adı/), 'Kariyer Günü');
    await user.type(screen.getByLabelText(/Açıklama/), 'Mezunlarla sohbet.');
    await user.type(screen.getByLabelText(/^Yer/), 'Amfi 2');
    fireEvent.change(screen.getByLabelText(/Başlangıç/), { target: { value: '2026-12-01T14:00' } });
    fireEvent.change(screen.getByLabelText(/Bitiş/), { target: { value: '2026-12-01T16:00' } });
    await user.type(screen.getByLabelText(/Kontenjan/), '40');
    await user.click(screen.getByRole('checkbox', { name: 'Yönetim Bilişim Sistemleri' }));
  }

  it('etkinlik oluşturma başarılı: toast gösterilir ve form temizlenir', async () => {
    mocks.create.mockResolvedValue({ ok: true, data: { id: 'yeni' } });
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
    expect(await screen.findByText('Etkinliğin incelemeye gönderildi.')).toBeVisible();
    expect(screen.getByLabelText(/Etkinlik adı/)).toHaveValue('');
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('etkinlik oluşturma hatası: alan hatası alanın altında, girilen HİÇBİR değer silinmez', async () => {
    mocks.create.mockResolvedValue({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { title: 'VALIDATION_INVALID' },
    });
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
    expect(await screen.findAllByText(messages.errors.codes.VALIDATION_INVALID)).not.toHaveLength(
      0,
    );
    expect(screen.getByLabelText(/Etkinlik adı/)).toHaveValue('Kariyer Günü');
    expect(screen.getByLabelText(/Açıklama/)).toHaveValue('Mezunlarla sohbet.');
    expect(screen.getByLabelText(/Kontenjan/)).toHaveValue(40);
    expect(screen.getByRole('checkbox', { name: 'Yönetim Bilişim Sistemleri' })).toBeChecked();
    expect(screen.queryByText('Etkinliğin incelemeye gönderildi.')).toBeNull();
  });
});
