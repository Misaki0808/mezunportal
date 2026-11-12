// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { ToastProvider } from '@/components/ui';
import { ContactSendForm } from './contact-send-form';

vi.mock('@/server/actions/contact-request', () => ({ sendContactRequest: vi.fn() }));
it('yalnız sunucunun talep edilebilir dediği alanlar seçilebilir ve diğerlerinin nedeni açıklanır', () => {
  renderUi(
    <ToastProvider>
      <ContactSendForm targetUserId="target" requestableFields={['EMAIL']} />
    </ToastProvider>,
  );
  expect(screen.getByRole('checkbox', { name: 'E-posta' })).toBeEnabled();
  const phone = screen.getByRole('checkbox', { name: 'Telefon' });
  expect(phone).toBeDisabled();
  expect(phone).toHaveAccessibleDescription('Bu alan için talep gönderilemiyor.');
});
it('profil iletişiminde çift gönderim tek istek ve ağ hatasında mesaj korunur', async () => {
  const { sendContactRequest } = await import('@/server/actions/contact-request');
  const { act, fireEvent } = await import('@testing-library/react');
  const gate = Promise.withResolvers<never>();
  vi.mocked(sendContactRequest).mockReturnValueOnce(gate.promise);
  renderUi(
    <ToastProvider>
      <ContactSendForm targetUserId="target" requestableFields={['EMAIL']} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'E-posta' }));
  const note = screen.getByLabelText(/Kısa not/);
  fireEvent.change(note, { target: { value: 'Merhaba' } });
  const button = screen.getByRole('button', { name: 'Talep gönder' });
  fireEvent.submit(button.closest('form')!);
  fireEvent.submit(button.closest('form')!);
  expect(sendContactRequest).toHaveBeenCalledTimes(1);
  expect(button).toHaveAttribute('aria-busy', 'true');
  await act(async () => gate.reject(new Error('ağ')));
  expect(note).toHaveValue('Merhaba');
  expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
});
