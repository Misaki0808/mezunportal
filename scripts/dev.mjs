import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { readLocalSettings } from './local-env.mjs';

const mode = process.argv[2] ?? 'web';
let settings;
try {
  settings = readLocalSettings(readFileSync('.env.local', 'utf8'));
} catch {
  process.stderr.write(
    'Yerel ayar okunamadı. Önce sh scripts/worktree-env.sh çalıştır; APP_ENV ve APP_URL ayarını kontrol et.\n',
  );
  process.exit(1);
}
const { values, port } = settings;
const env = { ...process.env, ...values, PORT: String(port) };
if (mode === 'lan') {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry?.family === 'IPv4' && !entry.internal);
  if (!addresses.length) {
    process.stderr.write('Yerel ağ adresi bulunamadı. Wi-Fi bağlantısını kontrol et.\n');
    process.exit(1);
  }
  for (const address of addresses)
    process.stdout.write(`Telefon: http://${address.address}:${port}\n`);
  // Köken kontrolleri ve üretilen bağlantılar telefon adresini kullanır; dosya değiştirilmez.
  env.APP_URL = `http://${addresses[0].address}:${port}`;
}
const children = [];
let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
};
function start(args) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  children.push(child);
  child.once('error', () => stop(1));
  child.once('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
start([
  'node_modules/next/dist/bin/next',
  'dev',
  '--hostname',
  mode === 'lan' ? '0.0.0.0' : '127.0.0.1',
  '--port',
  String(port),
]);
if (mode === 'all') start(['--import', 'tsx', 'src/server/jobs/worker.ts']);
