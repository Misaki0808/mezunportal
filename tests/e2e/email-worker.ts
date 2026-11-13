import { spawn, type ChildProcess } from 'node:child_process';

/** E-posta işçisini sahte SMTP (Mailpit) ile başlatır; testler e-postayı işçi aracılığıyla alır. */
export function startEmailWorker(): ChildProcess {
  return spawn(
    process.execPath,
    ['--conditions=react-server', '--import', 'tsx', 'src/server/jobs/email-worker.ts'],
    {
      env: {
        ...process.env,
        APP_ENV: 'local',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
      },
      stdio: 'ignore',
    },
  );
}

/**
 * İşçiyi kapatır: önce SIGTERM, çıkışı bekler, takılırsa SIGKILL. Test bitince süreç yetim kalmaz
 * (yalnız SIGTERM yollayıp beklememek, koşu sonunda ppid 1 işçi bırakıyordu).
 */
export async function stopEmailWorker(worker: ChildProcess, graceMs = 8_000): Promise<void> {
  const exited = () => worker.exitCode !== null || worker.signalCode !== null;
  if (exited()) return;
  const stopped = new Promise<void>((resolve) => worker.once('exit', () => resolve()));
  worker.kill('SIGTERM');
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    stopped,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, graceMs);
    }),
  ]);
  clearTimeout(timer);
  if (!exited()) {
    worker.kill('SIGKILL');
    await stopped;
  }
}
