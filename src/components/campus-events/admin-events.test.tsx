// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
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
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
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
];

describe('AdminEvents', () => {
  it('gönder düğmesi her temada on-primary kullanır; engelli kararlar gerekçeye bağlanır', async () => {
    const { user } = renderWithToasts(<AdminEvents departments={[]} events={[EVENTS[1]!]} />);
    expect(screen.getByRole('button', { name: 'İncelemeye gönder' })).toHaveClass(
      'text-on-primary',
    );
    const cancel = screen.getByRole('button', { name: 'Etkinliği iptal et' });
    expect(cancel).toBeDisabled();
    expect(cancel).toHaveAccessibleDescription('İşlem gerekçesi en az 3 karakter olmalı.');
    await user.type(screen.getByLabelText('İşlem gerekçesi'), 'uygun');
    // Sebep başka yerde yazdığı için (disabledReasonId) düğme yeniden oluşmaz: aynı öğe etkinleşir.
    expect(cancel).toBeEnabled();
  });

  it('durumlar rozet olarak görünür; olay yoksa tek mesajlı boş durum çıkar', () => {
    const { unmount } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    const pending = screen.getByText('CV Atölyesi').closest('li')!;
    expect(within(pending).getByText('İnceleme bekliyor')).toBeInTheDocument();
    const published = screen.getByText('Kariyer Sohbeti').closest('li')!;
    expect(within(published).getByText('Yayında')).toBeInTheDocument();
    unmount();
    renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    expect(screen.getByText('Henüz yaklaşan etkinlik yok')).toBeInTheDocument();
    expect(screen.queryByLabelText('İşlem gerekçesi')).toBeNull();
  });

  it('gerekçe yokken onay ve ret kapalıdır, sebebi düğmenin altında yazar; sunucuya gitmez', async () => {
    renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    const pending = screen.getByText('CV Atölyesi').closest('li')!;
    expect(within(pending).getByRole('button', { name: 'Onayla' })).toBeDisabled();
    expect(within(pending).getByRole('button', { name: 'Reddet' })).toBeDisabled();
    // Sebep sayfada BİR kez yazar (alanın ipucu); iki düğme de ona bağlanır, her düğmenin altında tekrarlanmaz.
    expect(screen.getAllByText('İşlem gerekçesi en az 3 karakter olmalı.')).toHaveLength(1);
    for (const name of ['Onayla', 'Reddet']) {
      expect(within(pending).getByRole('button', { name })).toHaveAccessibleDescription(
        'İşlem gerekçesi en az 3 karakter olmalı.',
      );
    }
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it('gerekçe yazılınca onay ve ret sunucuya gider', async () => {
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.type(screen.getByLabelText('İşlem gerekçesi'), 'Uygun bulundu');
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(mocks.review).toHaveBeenCalledWith({
      eventId: EVENTS[0]!.id,
      decision: 'PUBLISH',
      reason: 'Uygun bulundu',
    });
    // Başarılı karardan sonra gerekçe temizlenir (eski gerekçe yeni karara taşınmaz): yeniden yaz.
    await user.type(screen.getByLabelText('İşlem gerekçesi'), 'Uygun bulundu');
    await user.click(await screen.findByRole('button', { name: 'Reddet' }));
    expect(mocks.review).toHaveBeenLastCalledWith({
      eventId: EVENTS[0]!.id,
      decision: 'REJECT',
      reason: 'Uygun bulundu',
    });
  });

  it('iptal gerekçeyle onay penceresi açar; pencerede onaylanınca sunucuya gider', async () => {
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.type(screen.getByLabelText('İşlem gerekçesi'), 'Salon yok');
    await user.click(screen.getByRole('button', { name: 'Etkinliği iptal et' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Etkinliği iptal et' }));
    expect(mocks.cancel).toHaveBeenCalledWith({ eventId: EVENTS[1]!.id, reason: 'Salon yok' });
  });

  it('karar başarılı: toast gösterilir ve gerekçe temizlenir', async () => {
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    const reason = screen.getByLabelText('İşlem gerekçesi');
    await user.type(reason, 'Uygun bulundu');
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Etkinlik yayınlandı.')).toBeInTheDocument();
    expect(reason).toHaveValue('');
  });

  it('ağ hatası formu düşürmez: gerekçe korunur, kararlı hata metni gösterilir, yeniden denenebilir', async () => {
    mocks.review.mockRejectedValueOnce(new Error('ağ'));
    const { user } = renderWithToasts(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    const reason = screen.getByLabelText('İşlem gerekçesi');
    await user.type(reason, 'Uygun bulundu');
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText(messages.errors.codes.SERVER_UNEXPECTED)).toBeInTheDocument();
    expect(reason).toHaveValue('Uygun bulundu');
    expect(screen.queryByText('Etkinlik yayınlandı.')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Onayla' }));
    expect(mocks.review).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Etkinlik yayınlandı.')).toBeInTheDocument();
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
    expect(await screen.findByText('Etkinliğin incelemeye gönderildi.')).toBeInTheDocument();
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
    expect(await screen.findByText(messages.errors.codes.VALIDATION_INVALID)).toBeInTheDocument();
    expect(screen.getByLabelText(/Etkinlik adı/)).toHaveValue('Kariyer Günü');
    expect(screen.getByLabelText(/Açıklama/)).toHaveValue('Mezunlarla sohbet.');
    expect(screen.getByLabelText(/Kontenjan/)).toHaveValue(40);
    expect(screen.getByRole('checkbox', { name: 'Yönetim Bilişim Sistemleri' })).toBeChecked();
    expect(screen.queryByText('Etkinliğin incelemeye gönderildi.')).toBeNull();
  });
});
