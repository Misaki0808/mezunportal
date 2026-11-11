// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';

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
    renderUi(<EventActions eventId={ID} registered={false} attended={false} full />);
    expect(screen.getByRole('button', { name: 'Katılıyorum' })).toBeDisabled();
    expect(screen.getByText('Kontenjan dolu')).toBeInTheDocument();
  });

  it('kayıt olunca sunucuya gider; kayıtlı kullanıcı kod alanını ve rozetini görür', async () => {
    const { user, rerender } = renderUi(
      <EventActions eventId={ID} registered={false} attended={false} full={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Katılıyorum' }));
    expect(mocks.register).toHaveBeenCalledWith({ eventId: ID });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    rerender(<EventActions eventId={ID} registered attended={false} full={false} />);
    expect(screen.getByText('Kayıtlısın')).toBeInTheDocument();
    expect(screen.getByLabelText('Altı haneli katılım kodu')).toBeInTheDocument();
  });

  it('eksik kodda sunucuya gitmez; sebep alanın altında söylenir, yazınca silinir', async () => {
    const { user } = renderUi(
      <EventActions eventId={ID} registered attended={false} full={false} />,
    );
    const field = screen.getByLabelText('Altı haneli katılım kodu');
    await user.type(field, '12ab3');
    expect(field).toHaveValue('123');
    await user.click(screen.getByRole('button', { name: 'Katılımı doğrula' }));
    expect(mocks.checkIn).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Altı haneli kodu eksiksiz yaz.');
    await user.type(field, '4');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('altı haneli kod sunucuya gider; doğrulanan katılım rozet olur', async () => {
    const { user, rerender } = renderUi(
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
});
