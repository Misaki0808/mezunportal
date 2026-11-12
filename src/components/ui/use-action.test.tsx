// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { ToastProvider } from './toast';
import { useAction } from './use-action';

function Harness({
  action,
  success,
  onOk,
  onFailure,
}: {
  action: () => Promise<
    | { ok: true; data: { id: number } }
    | { ok: false; errorCode: 'SERVER_UNEXPECTED' | 'RESOURCE_NOT_FOUND' }
  >;
  success?: string;
  onOk?: (data: { id: number }) => void;
  onFailure?: () => void;
}) {
  const a = useAction();
  return (
    <div>
      <button disabled={a.busy} onClick={() => void a.run(action, { success, onOk, onFailure })}>
        Gönder
      </button>
      <span data-testid="busy">{String(a.busy)}</span>
      {a.error && <p data-testid="error">{a.error}</p>}
    </div>
  );
}

const wrap = (node: React.ReactNode) => <ToastProvider>{node}</ToastProvider>;

describe('useAction', () => {
  it('başarıda toast gösterir, onOk çalışır, bekleyen durum biter', async () => {
    const onOk = vi.fn();
    const { user } = renderUi(
      wrap(
        <Harness
          action={async () => ({ ok: true, data: { id: 7 } })}
          success="Profilin güncellendi."
          onOk={onOk}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(onOk).toHaveBeenCalledWith({ id: 7 });
    expect(await screen.findByText('Profilin güncellendi.')).toBeInTheDocument();
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
  });

  it('çift gönderim kilidi: ilk eylem sürerken ikinci çağrı sunucuya gitmez', async () => {
    let release: (() => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<{ ok: true; data: { id: number } }>((resolve) => {
          release = () => resolve({ ok: true, data: { id: 1 } });
        }),
    );
    function Twice() {
      const a = useAction();
      return (
        <button
          onClick={() => {
            void a.run(action);
            void a.run(action);
          }}
        >
          İki kez
        </button>
      );
    }
    const { user } = renderUi(wrap(<Twice />));
    await user.click(screen.getByRole('button', { name: 'İki kez' }));
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => release?.());
  });

  it('hatada kararlı metin gösterilir, toast yok, onFailure çalışır', async () => {
    const onFailure = vi.fn();
    const { user } = renderUi(
      wrap(
        <Harness
          action={async () => ({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' })}
          success="Olmamalı"
          onFailure={onFailure}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByTestId('error')).toHaveTextContent(/.+/);
    expect(onFailure).toHaveBeenCalled();
    expect(screen.queryByText('Olmamalı')).toBeNull();
  });

  it('ağ hatası (fırlatılan) formu düşürmez: SERVER_UNEXPECTED metni, yeniden denenebilir', async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error('ağ'))
      .mockResolvedValueOnce({ ok: true, data: { id: 2 } });
    const { user } = renderUi(wrap(<Harness action={action} success="Tamam" />));
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByTestId('error')).toHaveTextContent(/.+/);
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.queryByTestId('error')).toBeNull());
    expect(await screen.findByText('Tamam')).toBeInTheDocument();
  });
});
