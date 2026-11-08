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
