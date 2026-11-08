import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Tek grup: gözetici, Next ve varsa worker ile bütün torunları. */
export function startDevProcesses(commands, env) {
  const supervisorPath = fileURLToPath(new URL('./dev-supervisor.mjs', import.meta.url));
  const child = spawn(process.execPath, [supervisorPath, JSON.stringify(commands)], {
    env,
    stdio: 'inherit',
    detached: true,
  });
  let stopping = false;
  let fallback;
  const parentPid = process.ppid;
  // pnpm veya onu başlatan kabuk zorla kapanırsa dev betiği de grubu kapatır.
  const parentWatch = setInterval(() => {
    if (process.ppid !== parentPid || process.ppid === 1) stop(1);
  }, 100);
  parentWatch.unref();
  function signalGroup(signal) {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  function stop(code) {
    if (stopping) return;
    stopping = true;
    clearInterval(parentWatch);
    process.exitCode = code;
    signalGroup('SIGTERM');
    fallback = setTimeout(() => signalGroup('SIGKILL'), 2000);
    fallback.unref();
  }
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  process.on('exit', () => signalGroup('SIGTERM'));
  child.once('error', () => stop(1));
  child.once('exit', (code) => {
    if (fallback) clearTimeout(fallback);
    if (!stopping) stop(code ?? 1);
  });
  return child;
}
