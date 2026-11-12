import { randomBytes } from 'node:crypto';

export function e2eWorkerCount(env: string | undefined, args: string[]): 1 | 2 {
  if (env !== undefined && env !== '1' && env !== '2')
    throw new Error('E2E_WORKERS yalnız 1 veya 2 olabilir');
  const option =
    args.find((arg) => arg.startsWith('--workers='))?.split('=')[1] ??
    (args.includes('--workers') ? args[args.indexOf('--workers') + 1] : undefined);
  if (option !== undefined && option !== '1' && option !== '2')
    throw new Error('E2E işçi sayısı yalnız 1 veya 2 olabilir');
  if (option === '2' && env !== '2') throw new Error('İki işçi için E2E_WORKERS=2 gerekli');
  return option === '1' ? 1 : env === '2' ? 2 : 1;
}

export function e2eDatabasePrefix(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const match = /^(\w{1,30})_e2e_[0-9a-f]{12}_[01]_test$/.exec(name);
  if (!match) throw new Error('Geçersiz geçici E2E veritabanı adı');
  return `${match[1]}_e2e_`;
}

export function e2eRunFromDatabase(name: string, prefix: string): string | undefined {
  if (!name.startsWith(prefix)) return undefined;
  return /^([0-9a-f]{12})_[01]_test$/.exec(name.slice(prefix.length))?.[1];
}

/** Yalnız E2E sürecine ait geçici veritabanları: diğer worktree'lerin ve geliştirme verisi korunur. */
export function isolationRunId(): string {
  const id = (process.env.E2E_ISOLATION_RUN ??= randomBytes(6).toString('hex'));
  if (!/^[0-9a-f]{12}$/.test(id)) throw new Error('Geçersiz E2E koşu kimliği');
  return id;
}

export function workerDatabaseUrl(index: number): string {
  if (index !== 0 && index !== 1) throw new Error('E2E en çok iki işçiyle çalışır');
  if (process.env.APP_ENV === 'prod') throw new Error('E2E canlı ortamda çalışmaz');
  const source = process.env.E2E_ORIGINAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source) throw new Error('E2E için DATABASE_URL gerekli');
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error('E2E veritabanı adresi geçersiz');
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('E2E veritabanı yalnız yerel olmalı');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Geçersiz E2E veritabanı adı');
  url.pathname = `/${database.slice(0, 30)}_e2e_${isolationRunId()}_${index}_test`;
  return url.toString();
}

export function workerBaseUrl(index: number): string {
  if (index !== 0 && index !== 1) throw new Error('E2E en çok iki işçiyle çalışır');
  const source = process.env.E2E_ORIGINAL_APP_URL ?? process.env.APP_URL;
  if (!source) throw new Error('E2E için APP_URL gerekli');
  const url = new URL(source);
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('E2E sunucusu yerel olmalı');
  const port = Number(url.port) + index * 20000;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('E2E portu geçersiz');
  return `http://127.0.0.1:${port}`;
}
