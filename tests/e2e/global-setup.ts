import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import pg from 'pg';
import { workerDatabaseUrl } from './isolation';

/** Her işçi için kendi seed'i ve hesapları olan tek kullanımlık E2E veritabanı. */
export default async function globalSetup(config: FullConfig) {
  if (config.workers > 2) throw new Error('E2E en çok iki işçiyle çalışır');
  const urls = Array.from({ length: config.workers }, (_, index) => workerDatabaseUrl(index));
  const adminUrl = new URL(urls[0]!);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const created: string[] = [];
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
