// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { AdminEvents } from './admin-events';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/campus-events', () => ({
  createCampusEvent: vi.fn(),
  cancelCampusEvent: vi.fn(),
  reviewCampusEvent: vi.fn(),
}));
it('gönder düğmesi her temada on-primary kullanır; engelli kararlar gerekçeye bağlanır', async () => {
  const user = userEvent.setup();
  renderUi(
    <AdminEvents
      departments={[]}
      events={[{ id: 'event', title: 'Buluşma', startsAt: new Date(), status: 'PUBLISHED' }]}
    />,
  );
  expect(screen.getByRole('button', { name: 'İncelemeye gönder' })).toHaveClass('text-on-primary');
  const cancel = screen.getByRole('button', { name: 'Etkinliği iptal et' });
  expect(cancel).toBeDisabled();
  expect(cancel).toHaveAccessibleDescription('İşlem gerekçesi en az 3 karakter olmalı.');
  await user.type(screen.getByLabelText('İşlem gerekçesi'), 'uygun');
  expect(cancel).toBeEnabled();
});
