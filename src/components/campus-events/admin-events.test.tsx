// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
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
  it('durumlar rozet olarak görünür; olay yoksa tek mesajlı boş durum çıkar', () => {
    const { unmount } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    const pending = screen.getByText('CV Atölyesi').closest('li')!;
    expect(within(pending).getByText('İnceleme bekliyor')).toBeInTheDocument();
    const published = screen.getByText('Kariyer Sohbeti').closest('li')!;
    expect(within(published).getByText('Yayında')).toBeInTheDocument();
    unmount();
    renderUi(<AdminEvents departments={DEPARTMENTS} events={[]} />);
    expect(screen.getByText('Henüz yaklaşan etkinlik yok')).toBeInTheDocument();
    expect(screen.queryByLabelText('İşlem gerekçesi')).toBeNull();
  });

  it('gerekçe yokken onay sunucuya gitmez; sebep söylenir ve odak alana gider', async () => {
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(mocks.review).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Önce işlem gerekçesini yaz.');
    expect(screen.getByLabelText('İşlem gerekçesi')).toHaveFocus();
  });

  it('gerekçe yazılınca onay ve ret sunucuya gider', async () => {
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.type(screen.getByLabelText('İşlem gerekçesi'), 'Uygun bulundu');
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(mocks.review).toHaveBeenCalledWith({
      eventId: EVENTS[0]!.id,
      decision: 'PUBLISH',
      reason: 'Uygun bulundu',
    });
    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    expect(mocks.review).toHaveBeenLastCalledWith({
      eventId: EVENTS[0]!.id,
      decision: 'REJECT',
      reason: 'Uygun bulundu',
    });
  });

  it('iptal gerekçesiz açılmaz; gerekçeyle onay penceresi açılır ve onay kapısı kurar', async () => {
    const { user } = renderUi(<AdminEvents departments={DEPARTMENTS} events={EVENTS} />);
    await user.click(screen.getByRole('button', { name: 'Etkinliği iptal et' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.type(screen.getByLabelText('İşlem gerekçesi'), 'Salon yok');
    await user.click(screen.getByRole('button', { name: 'Etkinliği iptal et' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Etkinliği iptal et' }));
    expect(mocks.cancel).toHaveBeenCalledWith({
      eventId: EVENTS[1]!.id,
      reason: 'Salon yok',
    });
  });
});
