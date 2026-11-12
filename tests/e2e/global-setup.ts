import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import pg from 'pg';
import {
  e2eDatabasePrefix,
  e2eRunFromDatabase,
  isolationRunId,
  workerDatabaseUrl,
} from './isolation';

/** Her işçi için kendi seed'i ve hesapları olan tek kullanımlık E2E veritabanı. */
export default async function globalSetup(config: FullConfig) {
  if (config.workers > 2) throw new Error('E2E en çok iki işçiyle çalışır');
  const urls = Array.from({ length: config.workers }, (_, index) => workerDatabaseUrl(index));
  const adminUrl = new URL(urls[0]!);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const created: string[] = [];
  const prefix = e2eDatabasePrefix(urls[0]!);
  const lockName = (run: string) => `mezunportal-e2e:${prefix}${run}`;
  async function cleanup() {
    for (const name of created) {
      // İsim yalnız bu koşunun rastgele son ekiyle üretilir; başka DB'ye dokunulmaz.
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
    await client.end();
    await rm(path.join('.data', `e2e-barrier-${process.env.E2E_ISOLATION_RUN}`), {
      recursive: true,
      force: true,
    });
  }
  try {
    // Bağlantı açık kaldığı sürece bu koşunun DB'leri başka bir koşu tarafından silinmez.
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      lockName(isolationRunId()),
    ]);
    const existing = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE left(datname, length($1)) = $1',
      [prefix],
    );
    const stale = new Map<string, string[]>();
    for (const { datname } of existing.rows) {
      const run = e2eRunFromDatabase(datname, prefix);
      if (!run || run === isolationRunId()) continue;
      stale.set(run, [...(stale.get(run) ?? []), datname]);
    }
    for (const [run, names] of stale) {
      const locked = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [lockName(run)],
      );
      if (!locked.rows[0]?.acquired) continue;
      try {
        // names yalnız sıkı ad doğrulamasından geçer; başka worktree DB'lerine dokunulmaz.
        for (const name of names)
          await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await rm(path.join('.data', `e2e-barrier-${run}`), { recursive: true, force: true });
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockName(run)]);
      }
    }
    for (const url of urls) {
      const name = decodeURIComponent(new URL(url).pathname.slice(1));
      if (!/^[a-zA-Z0-9_]+_e2e_[0-9a-f]{12}_[01]_test$/.test(name))
        throw new Error('Geçersiz geçici E2E veritabanı adı');
      await client.query(`CREATE DATABASE "${name}"`);
      created.push(name);
      const env = { ...process.env, DATABASE_URL: url };
      execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env, stdio: 'pipe' });
      execFileSync('node_modules/.bin/prisma', ['db', 'seed'], { env, stdio: 'pipe' });
    }
  } catch {
    await cleanup();
    throw new Error('Geçici E2E veritabanları hazırlanamadı');
  }
  return cleanup;
}
