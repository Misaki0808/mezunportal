// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui';
import type { GoogleCalendarStatus } from '@/contracts/google-calendar';
import { renderUi } from '@/test/render';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { GoogleCalendarPanel } from './google-calendar-panel';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const status = (over: Partial<GoogleCalendarStatus> = {}): GoogleCalendarStatus => ({
  mode: 'GOOGLE',
  configured: true,
  connection: 'NONE',
  accountLabel: null,
  connectedAt: null,
  redirectUri: 'https://mezunportal.example/api/google/callback',
  ...over,
});
const noop = async () => ({
  ok: true as const,
  data: { disconnected: true as const, revoked: true },
});
const panel = (props: Parameters<typeof GoogleCalendarPanel>[0]) => (
  <ToastProvider>
    <GoogleCalendarPanel {...props} />
  </ToastProvider>
);
const show = (
  over: Partial<GoogleCalendarStatus> = {},
  extra: Partial<Parameters<typeof GoogleCalendarPanel>[0]> = {},
) => renderUi(panel({ status: status(over), outcome: null, disconnect: noop, ...extra }));

describe('Google Takvim paneli', () => {
  it('bağlı değilken bağlama bağlantısı ve yönlendirme adresi görünür; kesme düğmesi yok', () => {
    show();
    expect(screen.getByText('Bağlı değil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Google Takvim'i bağla" })).toHaveAttribute(
      'href',
      '/api/google/connect',
    );
    expect(screen.getByText('https://mezunportal.example/api/google/callback')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bağlantıyı kes' })).toBeNull();
  });

  it('bağlıyken hesap etiketi ve kesme düğmesi var, bağlama bağlantısı yok', () => {
    show({
      connection: 'ACTIVE',
      accountLabel: 'platform@gmail.com',
      connectedAt: new Date('2030-06-17T06:00:00Z'),
    });
    expect(screen.getByText('Bağlı')).toBeInTheDocument();
    expect(screen.getByText('platform@gmail.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: "Google Takvim'i bağla" })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bağlantıyı kes' })).toBeInTheDocument();
  });

  it('yeniden bağlama gerekiyorsa uyarı ve "Yeniden bağla" bağlantısı çıkar', () => {
    show({ connection: 'NEEDS_RECONNECT' });
    expect(screen.getByText('Yeniden bağlamak gerekiyor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Yeniden bağla' })).toHaveAttribute(
      'href',
      '/api/google/connect',
    );
  });

  it('kapalı, sahte ve anahtarsız modlarda bağlama yoktur', () => {
    const cases: [Partial<GoogleCalendarStatus>, string][] = [
      [{ mode: 'OFF', configured: false, redirectUri: null }, 'Takvim kapalı'],
      [
        { mode: 'FAKE', configured: false, redirectUri: null },
        'Sahte takvim (yalnız yerel ve test)',
      ],
      [{ configured: false }, 'Google anahtarları tanımlı değil'],
    ];
    for (const [over, label] of cases) {
      const { unmount } = show(over);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /bağla/i })).toBeNull();
      unmount();
    }
  });

  it('dönüş sonucu bildirimi gösterilir', () => {
    show({}, { outcome: 'denied' });
    expect(screen.getByText('Google izni verilmedi, bağlantı kurulmadı.')).toBeInTheDocument();
  });

  it('kesme onay penceresiyle çalışır: önce sorar, onaylayınca eylemi çağırıp sayfayı yeniler', async () => {
    const disconnect = vi.fn(noop);
    const { user } = show({ connection: 'ACTIVE', accountLabel: 'x' }, { disconnect });
    await user.click(screen.getByRole('button', { name: 'Bağlantıyı kes' }));
    expect(disconnect).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Bağlantı kesilsin mi?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Evet, kes' }));
    await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
