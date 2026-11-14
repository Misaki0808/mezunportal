// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToasts } from '@/test/render';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  checkIn: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/server/actions/campus-events', () => ({
  registerCampusEvent: mocks.register,
  checkInCampusEvent: mocks.checkIn,
}));

import { EventActions } from './event-actions';

const ID = '018f0000-0000-7000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.register.mockResolvedValue({ ok: true, data: { registered: true } });
  mocks.checkIn.mockResolvedValue({ ok: true, data: { accepted: true } });
});

describe('EventActions', () => {
  it('kontenjan doluyken kayıt düğmesi kapalıdır ve sebebi yazar', () => {
    renderWithToasts(<EventActions eventId={ID} registered={false} attended={false} full />);
    expect(screen.getByRole('button', { name: 'Katılıyorum' })).toBeDisabled();
    expect(screen.getByText('Kontenjan dolu')).toBeInTheDocument();
  });

  it('kayıt olunca sunucuya gider; kayıtlı kullanıcı kod alanını ve rozetini görür', async () => {
    const { user, rerender } = renderWithToasts(
      <EventActions eventId={ID} registered={false} attended={false} full={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Katılıyorum' }));
    expect(mocks.register).toHaveBeenCalledWith({ eventId: ID });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(await screen.findByText('Kaydın alındı.')).toBeInTheDocument();
    rerender(<EventActions eventId={ID} registered attended={false} full={false} />);
    expect(screen.getByText('Kayıtlısın')).toBeInTheDocument();
    expect(screen.getByLabelText('Altı haneli katılım kodu')).toBeInTheDocument();
  });

  it('kayıttan sonra odak kalkan düğme yerine "Kayıtlısın" rozetine gelir', async () => {
    const { user, rerender } = renderWithToasts(
      <EventActions eventId={ID} registered={false} attended={false} full={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Katılıyorum' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    rerender(<EventActions eventId={ID} registered attended={false} full={false} />);
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('tabindex', '-1');
      expect(document.activeElement).toHaveTextContent('Kayıtlısın');
    });
  });

  it('sayfa zaten kayıtlı açılınca odak çalınmaz', () => {
    renderWithToasts(<EventActions eventId={ID} registered attended={false} full={false} />);
    expect(document.body).toHaveFocus();
  });

  it('katılım doğrulanınca odak "Katılımın doğrulandı" rozetine gelir', async () => {
    const { user, rerender } = renderWithToasts(
      <EventActions eventId={ID} registered attended={false} full={false} />,
    );
    await user.type(screen.getByLabelText('Altı haneli katılım kodu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Katılımı doğrula' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    rerender(<EventActions eventId={ID} registered attended full={false} />);
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('tabindex', '-1');
      expect(document.activeElement).toHaveTextContent('Katılımın doğrulandı');
    });
  });

  it('eksik kodda sunucuya gitmez; sebep alanın altında söylenir, yazınca silinir', async () => {
    const { user } = renderWithToasts(
      <EventActions eventId={ID} registered attended={false} full={false} />,
    );
    const field = screen.getByLabelText('Altı haneli katılım kodu');
    await user.type(field, '12ab3');
    expect(field).toHaveValue('123');
    await user.click(screen.getByRole('button', { name: 'Katılımı doğrula' }));
    expect(mocks.checkIn).not.toHaveBeenCalled();
    expect(screen.getByText('Altı haneli kodu eksiksiz yaz.')).toBeInTheDocument();
    await user.type(field, '4');
    expect(screen.queryByText('Altı haneli kodu eksiksiz yaz.')).toBeNull();
  });

  it('altı haneli kod sunucuya gider; doğrulanan katılım rozet olur', async () => {
    const { user, rerender } = renderWithToasts(
      <EventActions eventId={ID} registered attended={false} full={false} />,
    );
    await user.type(screen.getByLabelText('Altı haneli katılım kodu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Katılımı doğrula' }));
    expect(mocks.checkIn).toHaveBeenCalledWith({ eventId: ID, code: '123456' });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    rerender(<EventActions eventId={ID} registered attended full={false} />);
    expect(screen.getByText('Katılımın doğrulandı')).toBeInTheDocument();
    expect(screen.queryByLabelText('Altı haneli katılım kodu')).toBeNull();
  });

  it('yanlış kod: girilen değer korunur, sebep alanın altında söylenir, başarı bildirimi çıkmaz', async () => {
    mocks.checkIn.mockResolvedValue({ ok: true, data: { accepted: false } });
    const { user } = renderWithToasts(
      <EventActions eventId={ID} registered attended={false} full={false} />,
    );
    const field = screen.getByLabelText('Altı haneli katılım kodu');
    await user.type(field, '123456');
    await user.click(screen.getByRole('button', { name: 'Katılımı doğrula' }));
    expect(await screen.findByText(/Katılım doğrulanamadı/)).toBeInTheDocument();
    expect(field).toHaveValue('123456');
    expect(screen.queryByText('Katılımın doğrulandı.')).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('ağ hatası: kod ve ekran korunur, kararlı hata metni gösterilir, yeniden denenir', async () => {
    mocks.checkIn.mockRejectedValueOnce(new Error('ağ'));
    const { user } = renderWithToasts(
      <EventActions eventId={ID} registered attended={false} full={false} />,
    );
    const field = screen.getByLabelText('Altı haneli katılım kodu');
    await user.type(field, '123456');
    await user.click(screen.getByRole('button', { name: 'Katılımı doğrula' }));
    await waitFor(() => expect(mocks.checkIn).toHaveBeenCalledTimes(1));
    expect(field).toHaveValue('123456');
    await user.click(await screen.findByRole('button', { name: 'Katılımı doğrula' }));
    expect(mocks.checkIn).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Katılımın doğrulandı.')).toBeInTheDocument();
  });

  it('çift tıklama: eylem sürerken ikinci istek gitmez ve düğme bekleyen durumu duyurur', async () => {
    let release: (() => void) | undefined;
    mocks.register.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: { registered: true } });
        }),
    );
    const { user } = renderWithToasts(
      <EventActions eventId={ID} registered={false} attended={false} full={false} />,
    );
    const button = screen.getByRole('button', { name: 'Katılıyorum' });
    await user.dblClick(button);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Kaydediliyor/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    release?.();
    expect(await screen.findByText('Kaydın alındı.')).toBeInTheDocument();
  });
});
