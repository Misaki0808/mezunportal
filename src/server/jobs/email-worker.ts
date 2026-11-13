import { createEmailRuntime } from './email';
import { createAppointmentRuntime } from './appointment';
import { createCvRuntime } from './cv';
import { createNotificationRuntime } from './notification-worker';
import { createPointsRuntime } from './points';
import { getDb } from '../db';
import { isLlmConfigured } from '../external/llm';
import { createWorkerShutdown, stopWorkerRuntimes } from './worker-shutdown';
import { pathToFileURL } from 'node:url';
async function main() {
  const runtime = await createEmailRuntime(true);
  // CV ayrıştırma kuyruğu yalnız sağlayıcı yapılandırılmışsa dinlenir (yoksa yükleme zaten kapalıdır).
  const cvRuntime = isLlmConfigured()
    ? await createCvRuntime(true).catch(async (error: unknown) => {
        await runtime.stop().catch(() => undefined);
        throw error;
      })
    : null;
  const appointmentRuntime = await createAppointmentRuntime(true).catch(async (error: unknown) => {
    await cvRuntime?.stop().catch(() => undefined);
    await runtime.stop().catch(() => undefined);
    throw error;
  });
  const pointsRuntime = await createPointsRuntime(true).catch(async (error: unknown) => {
    await appointmentRuntime.stop().catch(() => undefined);
    await cvRuntime?.stop().catch(() => undefined);
    await runtime.stop().catch(() => undefined);
    throw error;
  });
  const notifications = await createNotificationRuntime().catch(async () => {
    await pointsRuntime.stop().catch(() => undefined);
    await appointmentRuntime.stop().catch(() => undefined);
    await cvRuntime?.stop().catch(() => undefined);
    await runtime.stop().catch(() => undefined);
    throw new Error('NOTIFICATION_WORKER_UNAVAILABLE');
  });
  const heartbeat = () => process.stdout.write('worker: ok\n');
  heartbeat();
  const timer = setInterval(heartbeat, 30_000);
  const onSignal = createWorkerShutdown({
    stop: () => {
      clearInterval(timer);
      return stopWorkerRuntimes(
        [
          () => notifications.stop(),
          () => pointsRuntime.stop(),
          () => appointmentRuntime.stop(),
          async () => cvRuntime?.stop(),
          () => runtime.stop(),
        ],
        () => getDb().$disconnect(),
      );
    },
    exit: (code) => process.exit(code),
    write: (line) => process.stderr.write(line),
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, onSignal);
}
// Modül bağımlılıkları yan etkisiz yüklenebilir; gerçek worker yalnız giriş noktası olarak çalışır.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => {
    process.stderr.write('worker: unavailable\n');
    process.exitCode = 1;
  });
}
