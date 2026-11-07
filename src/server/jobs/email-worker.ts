import { createEmailRuntime } from './email';
import { getDb } from '../db';
async function main() {
  const runtime = await createEmailRuntime(true);
  const heartbeat = () => process.stdout.write('worker: ok\n');
  heartbeat();
  const timer = setInterval(heartbeat, 30_000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    try {
      await runtime.stop();
      await getDb().$disconnect();
    } catch {
      process.stderr.write('worker: stop failed\n');
      process.exitCode = 1;
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      void stop();
    });
}
main().catch(() => {
  process.stderr.write('worker: unavailable\n');
  process.exitCode = 1;
});
