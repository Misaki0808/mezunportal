// Node worker da `server-only` sınırını doğru React sunucu koşuluyla yükler.
// dev betiğini değiştirmeden kendi giriş noktasından çalıştırılır.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const worker = spawn(
  process.execPath,
  [
    '--conditions=react-server',
    '--import',
    'tsx',
    fileURLToPath(new URL('./email-worker.ts', import.meta.url)),
  ],
  { stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => worker.kill('SIGTERM'));
worker.on('error', () => {
  process.stderr.write('worker: unavailable\n');
  process.exitCode = 1;
});
worker.on('exit', (code, signal) => {
  process.exitCode = signal === 'SIGTERM' ? 0 : (code ?? 1);
});
