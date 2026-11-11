// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { SignInForm } from './sign-in-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const disabledOptions = {
  linkedin: { enabled: false as const, disabledReason: 'AUTH_PROVIDER_NOT_CONFIGURED' as const },
};
const startLinkedIn = vi.fn();

describe('SignInForm', () => {
  beforeEach(() => {
    push.mockClear();
    startLinkedIn.mockReset();
  });
  it('LinkedIn kapalıysa düğme ve veya ayracı görünmez', () => {
    renderUi(
      <SignInForm options={disabledOptions} requestLink={vi.fn()} startLinkedIn={startLinkedIn} />,
    );
    expect(screen.queryByRole('button', { name: 'LinkedIn ile devam et' })).not.toBeInTheDocument();
    expect(screen.queryByText('veya', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/E-posta adresi/)).toHaveAccessibleDescription(
      /üniversite adresini/,
    );
  });
  it('LinkedIn açıkken ikonlu düğme ve ayraç e-posta alanının üstündedir', () => {
    renderUi(
      <SignInForm
        options={{ linkedin: { enabled: true, disabledReason: null } }}
        requestLink={vi.fn()}
        startLinkedIn={startLinkedIn}
      />,
    );
    const button = screen.getByRole('button', { name: 'LinkedIn ile devam et' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('veya', { exact: true })).toBeInTheDocument();
    expect(
      button.compareDocumentPosition(screen.getByLabelText(/E-posta adresi/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it('geçersiz e-postayı alanda gösterir ve sunucuya göndermez', async () => {
    const request = vi.fn();
    const { user } = renderUi(
      <SignInForm options={disabledOptions} requestLink={request} startLinkedIn={startLinkedIn} />,
    );
    await user.type(screen.getByLabelText(/E-posta adresi/), 'yanlis');
    await user.click(screen.getByRole('button', { name: 'Giriş bağlantısı gönder' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
  it('boş gönderimde odak gönder düğmesinde kalmaz, ilk hatalı alana (e-posta) gider', async () => {
    const request = vi.fn();
    const { user } = renderUi(
      <SignInForm options={disabledOptions} requestLink={request} startLinkedIn={startLinkedIn} />,
    );
    await user.click(screen.getByRole('button', { name: 'Giriş bağlantısı gönder' }));
    const field = screen.getByLabelText(/E-posta adresi/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['kayitli@example.test', 'kayitsiz@example.test'])(
    'başarılı nötr yanıtı aynı ekrana götürür: %s',
    async (email) => {
      const request = vi.fn().mockResolvedValue({ ok: true, data: { status: 'CHECK_EMAIL' } });
      const { user } = renderUi(
        <SignInForm
          options={disabledOptions}
          requestLink={request}
          startLinkedIn={startLinkedIn}
        />,
      );
      await user.type(screen.getByLabelText(/E-posta adresi/), email);
      await user.click(screen.getByRole('button', { name: 'Giriş bağlantısı gönder' }));
      await waitFor(() => expect(push).toHaveBeenCalledWith('/giris/epostani-kontrol-et'));
    },
  );
  it('sunucu hata kodunu katalog metni olarak gösterir', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderUi(
      <SignInForm options={disabledOptions} requestLink={request} startLinkedIn={startLinkedIn} />,
    );
    await user.type(screen.getByLabelText(/E-posta adresi/), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Giriş bağlantısı gönder' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('RATE_LIMITED');
  });
  it('giriş sonrası güvenli dönüş yolunu e-posta bağlantısı isteğine taşır', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: { status: 'CHECK_EMAIL' } });
    const { user } = renderUi(
      <SignInForm
        options={disabledOptions}
        returnTo="/hesap/gizlilik"
        requestLink={request}
        startLinkedIn={startLinkedIn}
      />,
    );
    await user.type(screen.getByLabelText(/E-posta adresi/), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Giriş bağlantısı gönder' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        email: 'test@example.test',
        returnTo: '/hesap/gizlilik',
      }),
    );
  });
});
