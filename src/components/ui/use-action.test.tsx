// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
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
  it('başarı sonrası onOk hatası başarılı eylemi ağ hatası olarak göstermez', async () => {
    const onFailure = vi.fn();
    const { user } = renderUi(
      wrap(
        <Harness
          action={async () => ({ ok: true, data: { id: 7 } })}
          success="Kaydedildi"
          onOk={() => {
            throw new Error('takip işlemi');
          }}
          onFailure={onFailure}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(await screen.findByText('Kaydedildi')).toBeInTheDocument();
    expect(screen.queryByTestId('error')).toBeNull();
    expect(onFailure).not.toHaveBeenCalled();
  });
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

  it("odak: düğme eylemle kalkarsa odak sayfa başlığına taşınır (BODY'ye düşmez)", async () => {
    function Gone() {
      const a = useAction();
      const [done, setDone] = useState(false);
      return (
        <main>
          <h1>Liste</h1>
          {!done && (
            <button
              onClick={() =>
                void a.run(async () => ({ ok: true, data: 1 }), { onOk: () => setDone(true) })
              }
            >
              Onayla
            </button>
          )}
        </main>
      );
    }
    const { user } = renderUi(wrap(<Gone />));
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Liste' })).toHaveFocus());
  });

  it('odak: eylem sonrası düğme pasifleşip sebebiyle yer değiştirirse başlığa taşınır', async () => {
    function Swap() {
      const a = useAction();
      const [spent, setSpent] = useState(false);
      return (
        <main>
          <h1>Bildirimler</h1>
          {spent ? (
            <span>
              <button disabled>Hepsi okundu</button>
              <span>Okunmamış yok.</span>
            </span>
          ) : (
            <button
              onClick={() =>
                void a.run(async () => ({ ok: true, data: 1 }), { onOk: () => setSpent(true) })
              }
            >
              Hepsini oku
            </button>
          )}
        </main>
      );
    }
    const { user } = renderUi(wrap(<Swap />));
    await user.click(screen.getByRole('button', { name: 'Hepsini oku' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bildirimler' })).toHaveFocus());
  });

  it('odak: eylem düğmeyi bırakıyorsa (hata, düğme duruyor) odak düğmede kalır', async () => {
    const { user } = renderUi(
      wrap(
        <main>
          <h1>Başlık</h1>
          <Harness action={async () => ({ ok: false, errorCode: 'SERVER_UNEXPECTED' })} />
        </main>,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getByRole('button', { name: 'Gönder' })).toHaveFocus();
  });

  it('odak: onOk odağı kendisi taşıdıysa ona dokunulmaz', async () => {
    function Own() {
      const a = useAction();
      const [done, setDone] = useState(false);
      return (
        <main>
          <h1>Başlık</h1>
          <input aria-label="Sonraki alan" />
          {!done && (
            <button
              onClick={() =>
                void a.run(async () => ({ ok: true, data: 1 }), {
                  onOk: () => {
                    setDone(true);
                    document.querySelector<HTMLElement>('input')?.focus();
                  },
                })
              }
            >
              Gönder
            </button>
          )}
        </main>
      );
    }
    const { user } = renderUi(wrap(<Own />));
    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getByLabelText('Sonraki alan')).toHaveFocus();
  });

  it('odak: focusTarget verilirse kurtarma oraya gider; false ise kapalıdır', async () => {
    function Custom({ off }: { off?: boolean }) {
      const a = useAction();
      const [done, setDone] = useState(false);
      return (
        <main>
          <h1>Başlık</h1>
          <p id="ozel">Özel hedef</p>
          {!done && (
            <button
              onClick={() =>
                void a.run(async () => ({ ok: true, data: 1 }), {
                  onOk: () => setDone(true),
                  focusTarget: off ? false : () => document.getElementById('ozel'),
                })
              }
            >
              Gönder
            </button>
          )}
        </main>
      );
    }
    const first = renderUi(wrap(<Custom />));
    await first.user.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(document.getElementById('ozel')).toHaveFocus());
    first.unmount();
    const second = renderUi(wrap(<Custom off />));
    await second.user.click(screen.getByRole('button', { name: 'Gönder' }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(document.body).toHaveFocus();
  });
});

describe('odak kurtarma yaşam döngüsü', () => {
  it('bileşen bekleyen eylem bitmeden kalkarsa sonradan yoklama başlatmaz', async () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      let finish!: (value: { ok: true; data: { id: number } }) => void;
      const action = () =>
        new Promise<{ ok: true; data: { id: number } }>((resolve) => {
          finish = resolve;
        });
      const view = renderUi(wrap(<Harness action={action} />));
      const button = screen.getByRole('button', { name: 'Gönder' });
      button.focus();
      fireEvent.click(button);
      view.unmount();
      await act(async () => {
        finish({ ok: true, data: { id: 1 } });
        await Promise.resolve();
      });
      expect(timer.mock.calls.filter(([, delay]) => delay === 60)).toHaveLength(0);
    } finally {
      vi.clearAllTimers();
      timer.mockRestore();
      clear.mockRestore();
      vi.useRealTimers();
    }
  });

  it('yeni eylem başlarken eski kurtarma yoklamasını iptal eder', async () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      let finish!: (value: { ok: true; data: { id: number } }) => void;
      const action = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, data: { id: 1 } })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
      const view = renderUi(wrap(<Harness action={action} />));
      const button = screen.getByRole('button', { name: 'Gönder' });
      button.focus();
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
      const index = timer.mock.calls.findIndex(([, delay]) => delay === 60);
      expect(index).toBeGreaterThanOrEqual(0);
      const handle = timer.mock.results[index]?.value;
      fireEvent.click(button);
      expect(clear).toHaveBeenCalledWith(handle);
      view.unmount();
      await act(async () => {
        finish({ ok: true, data: { id: 2 } });
        await Promise.resolve();
      });
      expect(timer.mock.calls.filter(([, delay]) => delay === 60)).toHaveLength(1);
    } finally {
      vi.clearAllTimers();
      timer.mockRestore();
      clear.mockRestore();
      vi.useRealTimers();
    }
  });
});
