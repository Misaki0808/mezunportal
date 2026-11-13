import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORKER_DUPLICATE_SIGNAL_MS,
  WORKER_SHUTDOWN_TIMEOUT_MS,
  createWorkerShutdown,
  stopWorkerRuntimes,
} from './worker-shutdown';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(stop: () => Promise<void>) {
  const exit = vi.fn();
  const write = vi.fn();
  const stopSpy = vi.fn(stop);
  const onSignal = createWorkerShutdown({
    stop: stopSpy,
    exit,
    write,
    now: () => Date.now(),
  });
  return { onSignal, exit, write, stopSpy };
}

describe('işçi kapanışı', () => {
  it('normal kapanış 0 koduyla çıkar, sabit hata satırı yazmaz ve süre aşımı sonradan tetiklenmez', async () => {
    const { onSignal, exit, write } = setup(async () => undefined);
    onSignal();
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    await vi.advanceTimersByTimeAsync(WORKER_SHUTDOWN_TIMEOUT_MS * 2);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('takılan kapanış süre sonunda sabit satırla 1 koduyla çıkar', async () => {
    const { onSignal, exit, write } = setup(() => new Promise<void>(() => undefined));
    onSignal();
    await vi.advanceTimersByTimeAsync(WORKER_SHUTDOWN_TIMEOUT_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(write).toHaveBeenCalledExactlyOnceWith('worker: stop timeout\n');
  });

  it('kapanış hata verirse sabit satırla 1 koduyla çıkar (hata metni yazılmaz)', async () => {
    const { onSignal, exit, write } = setup(() => Promise.reject(new Error('ayrıntı: gizli')));
    onSignal();
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(write).toHaveBeenCalledExactlyOnceWith('worker: stop failed\n');
    expect(JSON.stringify(write.mock.calls)).not.toContain('gizli');
  });

  it('aynı anda gelen ikinci sinyal kopyadır: yok sayılır, kapanış bir kez başlar', async () => {
    const { onSignal, exit, stopSpy } = setup(() => new Promise<void>(() => undefined));
    onSignal();
    onSignal();
    await vi.advanceTimersByTimeAsync(WORKER_DUPLICATE_SIGNAL_MS - 1);
    onSignal();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('kapanış sürerken gecikmiş ikinci sinyal hemen çıkar', async () => {
    const { onSignal, exit, write, stopSpy } = setup(() => new Promise<void>(() => undefined));
    onSignal();
    await vi.advanceTimersByTimeAsync(WORKER_DUPLICATE_SIGNAL_MS);
    onSignal();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(write).toHaveBeenCalledExactlyOnceWith('worker: forced exit\n');
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});

describe('işçi çalışma ortamlarını kapatma', () => {
  it('biri hata verse de ötekileri ve DB bağlantısını kapatır, sonra reddeder', async () => {
    const stops = [
      vi.fn(async () => undefined),
      vi.fn(() => Promise.reject(new Error('x'))),
      vi.fn(async () => undefined),
    ];
    const disconnect = vi.fn(async () => undefined);
    await expect(stopWorkerRuntimes(stops, disconnect)).rejects.toThrow('WORKER_STOP_FAILED');
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('eşzamanlı (sıralı olmayan) hata da kalanları durdurur; hepsi iyiyse çözülür', async () => {
    const throwing = vi.fn(() => {
      throw new Error('eşzamanlı');
    });
    const ok = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    await expect(stopWorkerRuntimes([throwing, ok], disconnect)).rejects.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    await expect(stopWorkerRuntimes([ok, ok], disconnect)).resolves.toBeUndefined();
  });

  it('DB bağlantısı kapanmazsa da hata sayılır', async () => {
    await expect(
      stopWorkerRuntimes([async () => undefined], () => Promise.reject(new Error('d'))),
    ).rejects.toThrow('WORKER_STOP_FAILED');
  });
});
