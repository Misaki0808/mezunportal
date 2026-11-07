import { execFileSync } from 'node:child_process';
import pg from 'pg';

import { resolveTestDatabaseUrl } from './db-guard';

/**
 * Veritabanlı testler başlamadan: test veritabanını sıfırlar (şema `public` düşer) ve bütün
 * migration'ları boş veritabanına uygular. Böylece "migration boş veritabanında koşar" her koşuda
 * kanıtlanır. Güvenlik: adı `_test` ile bitmeyen veritabanına asla dokunmaz.
 */
export default async function setup() {
  const url = resolveTestDatabaseUrl(process.env);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  try {
    execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (error) {
    const output = error instanceof Error ? error.message : 'bilinmeyen hata';
    throw new Error(
      `prisma migrate deploy başarısız: ${output.replaceAll(url, '<DATABASE_URL_TEST>')}`,
    );
  }
}
