/**
 * İşçi kapanışı. Kapanış süre sınırlıdır: `stop()` takılırsa ya da bitince süreç açık tutamaç yüzünden
 * çıkmıyorsa işçi yetim kalmasın diye süreç açıkça sonlandırılır. Hiçbir adım kişisel veri yazmaz;
 * yalnız sabit satırlar yazılır.
 */

/** pg-boss zarif kapanış süresi (15 sn) + pay. Daha uzun süren kapanış takılmış sayılır. */
export const WORKER_SHUTDOWN_TIMEOUT_MS = 20_000;
/** Terminalde Ctrl+C hem işçiye hem üst sürece SIGINT yollar; üst süreç ayrıca SIGTERM iletir. */
export const WORKER_DUPLICATE_SIGNAL_MS = 1_000;

export interface WorkerShutdownOptions {
  stop: () => Promise<void>;
  exit: (code: number) => void;
  write: (line: string) => void;
  timeoutMs?: number;
  duplicateSignalMs?: number;
  now?: () => number;
}

/**
 * Sinyal işleyicisi üretir. İlk sinyal kapanışı başlatır (başarıda çıkış 0; hata ya da süre aşımında 1).
 * Kapanış sürerken, ilk sinyalden `duplicateSignalMs` sonra gelen ikinci sinyal hemen çıkar (1);
 * öncesinde gelen aynı tuşun/iletimin kopyasıdır ve yok sayılır.
 */
export function createWorkerShutdown(options: WorkerShutdownOptions): () => void {
  const timeoutMs = options.timeoutMs ?? WORKER_SHUTDOWN_TIMEOUT_MS;
  const duplicateMs = options.duplicateSignalMs ?? WORKER_DUPLICATE_SIGNAL_MS;
  const now = options.now ?? Date.now;
  let startedAt: number | undefined;
  let timer: NodeJS.Timeout | undefined;
  return () => {
    if (startedAt !== undefined) {
      if (now() - startedAt >= duplicateMs) {
        options.write('worker: forced exit\n');
        options.exit(1);
      }
      return;
    }
    startedAt = now();
    // Zamanlayıcı tutamaçtır: stop() hiçbir tutamaç bırakmadan takılsa bile süreç 1 koduyla sonlanır.
    timer = setTimeout(() => {
      options.write('worker: stop timeout\n');
      options.exit(1);
    }, timeoutMs);
    options.stop().then(
      () => {
        clearTimeout(timer);
        options.exit(0);
      },
      () => {
        clearTimeout(timer);
        options.write('worker: stop failed\n');
        options.exit(1);
      },
    );
  };
}

/**
 * Bağımsız kuyruk çalışma ortamlarını birlikte kapatır: biri hata verse de ötekiler durdurulur
 * (eskiden ilk hata kalanları açık bırakıp işçiyi yaşatıyordu); sonra DB bağlantısı kapanır.
 * Herhangi bir adım başarısızsa reddeder.
 */
export async function stopWorkerRuntimes(
  stops: Array<() => Promise<unknown>>,
  disconnect: () => Promise<unknown>,
): Promise<void> {
  const results = await Promise.allSettled(stops.map((stop) => Promise.resolve().then(stop)));
  const disconnected = await Promise.allSettled([Promise.resolve().then(disconnect)]);
  if ([...results, ...disconnected].some((result) => result.status === 'rejected')) {
    throw new Error('WORKER_STOP_FAILED');
  }
}
