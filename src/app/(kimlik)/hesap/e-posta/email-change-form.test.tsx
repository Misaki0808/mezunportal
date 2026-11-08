// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { EmailChangeForm } from './email-change-form';

describe('EmailChangeForm', () => {
  it('geçersiz adresi göndermez', async () => {
    const submit = vi.fn();
    const { user } = renderUi(<EmailChangeForm submit={submit} />);
    await user.type(screen.getByLabelText(/Yeni e-posta adresi/), 'hata');
    await user.click(screen.getByRole('button', { name: 'Doğrulama bağlantısı gönder' }));
    expect(screen.getByText('Geçerli bir e-posta adresi yaz.')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });
  it('nötr başarılı yanıtı ve kişisel veri içermeyen mesajı gösterir', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true, data: { status: 'CHECK_EMAIL' } });
    const { user } = renderUi(<EmailChangeForm submit={submit} />);
    await user.type(screen.getByLabelText(/Yeni e-posta adresi/), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Doğrulama bağlantısı gönder' }));
    expect(await screen.findByRole('status')).toHaveTextContent('E-postanı kontrol et');
    expect(screen.getByRole('status')).not.toHaveTextContent('test@example.test');
  });
});
