import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Yerel ayar (worktree başına veritabanı adresleri) Git dışı `.env.local`'dadır; CI'da değişkenler
// ortamdan gelir. Değişkenler test işçilerine miras kalır.
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      // `server-only` paketi sunucu dışında içe aktarılınca fırlatır; birim testlerinde etkisizdir.
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
      },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
          exclude: ['**/*.db.test.ts', '**/node_modules/**'],
        },
      },
      {
        // Gerçek PostgreSQL ister: yalnız `DATABASE_URL_TEST` (adı `_test` ile biten veritabanı).
        // Başlamadan önce o veritabanı sıfırlanır ve migration'lar uygulanır.
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.db.test.ts', 'prisma/**/*.db.test.ts'],
          globalSetup: ['./src/test/db-global-setup.ts'],
          // Tek test veritabanı paylaşılır; dosyalar sırayla koşar.
          fileParallelism: false,
        },
      },
    ],
  },
});
