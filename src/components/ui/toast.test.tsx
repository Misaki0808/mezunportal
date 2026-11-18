// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { ToastProvider, useToast } from './toast';

function Trigger({ tone }: { tone?: 'info' | 'success' | 'error' }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show({ message: 'Kaydedildi', tone })}>
      Göster
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('bilgi bildirimi kibar canlı bölgede (status) görünür', async () => {
    const { user } = renderUi(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByRole('status')).toHaveTextContent('Kaydedildi');
  });

  it('hata bildirimi anında duyurulan bölgede (alert) görünür', async () => {
    const { user } = renderUi(
      <ToastProvider>
        <Trigger tone="error" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Kaydedildi');
    expect(screen.getByRole('status')).not.toHaveTextContent('Kaydedildi');
  });

  it('kapat düğmesi bildirimi kaldırır', async () => {
    const { user } = renderUi(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Göster' }));
    await user.click(screen.getByRole('button', { name: 'Bildirimi kapat' }));
    expect(screen.queryByText('Kaydedildi')).not.toBeInTheDocument();
  });

  it('süre dolunca kendiliğinden kaybolur', async () => {
    const { user } = renderUi(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByText('Kaydedildi')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6100);
    });
    expect(screen.queryByText('Kaydedildi')).not.toBeInTheDocument();
  });

  it('ToastProvider dışında useToast hata verir', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderUi(<Trigger />)).toThrow();
    spy.mockRestore();
  });

  it('aynı ileti ardışık gelirse iki kutu yığılmaz; süre yeniden başlar', async () => {
    const { user } = renderUi(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Göster' }));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    await user.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getAllByText('Kaydedildi')).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('Kaydedildi')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.queryByText('Kaydedildi')).not.toBeInTheDocument();
  });

  it('farklı iletiler yığılır', async () => {
    function Two() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            toast.show({ message: 'Birinci' });
            toast.show({ message: 'İkinci' });
          }}
        >
          İkisi
        </button>
      );
    }
    const { user } = renderUi(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'İkisi' }));
    expect(screen.getByText('Birinci')).toBeInTheDocument();
    expect(screen.getByText('İkinci')).toBeInTheDocument();
  });
});
