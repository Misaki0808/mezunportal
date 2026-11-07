import { execFileSync } from 'node:child_process';
import pg from 'pg';

/**
 * Veritabanlı testler başlamadan: test veritabanını sıfırlar (şema `public` düşer) ve bütün
 * migration'ları boş veritabanına uygular. Böylece "migration boş veritabanında koşar" her koşuda
 * kanıtlanır. Güvenlik: adı `_test` ile bitmeyen veritabanına asla dokunmaz.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST tanımlı değil: veritabanlı testler için .env.local ya da ortamda test ' +
        'veritabanı adresi gerekir (docs/engineering.md "Yerel ortam"). Yalnız birim testleri için: pnpm test:unit',
    );
  }
  const databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!databaseName.endsWith('_test')) {
    throw new Error('DATABASE_URL_TEST adı "_test" ile bitmiyor; sıfırlama reddedildi');
  }

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
