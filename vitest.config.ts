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
    // Ajan ortamında otomatik minimal raporlayıcı yavaş test adını/süresini gizler.
    reporters: process.env.GITHUB_ACTIONS === 'true' ? ['default', 'github-actions'] : ['default'],
    // Vitest bu eşiği proje genelinde raporlar; 5 sn üzerindeki DB testleri görünür kalır.
    slowTestThreshold: 5000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          testTimeout: 5000,
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'prisma/**/*.test.ts'],
          exclude: ['**/*.db.test.ts', '**/*.perf.test.ts', '**/node_modules/**'],
        },
      },
      {
        // Gerçek PostgreSQL ister: yalnız `DATABASE_URL_TEST` (adı `_test` ile biten veritabanı).
        // Başlamadan önce o veritabanı sıfırlanır ve migration'lar uygulanır.
        extends: true,
        test: {
          name: 'db',
          testTimeout: 15000,
          // Yük altında gerçek veritabanı bağlantılarının kapanması için ayrı pay.
          hookTimeout: 30000,
          environment: 'node',
          include: ['src/**/*.db.test.ts', 'prisma/**/*.db.test.ts'],
          globalSetup: ['./src/test/db-global-setup.ts'],
          // Tek test veritabanı paylaşılır; dosyalar sırayla koşar.
          fileParallelism: false,
        },
      },
      // Yerel performans ölçümü (P2-14): yalnız `PERF=1` iken var (`pnpm test:perf`); `pnpm test` ve CI'da koşmaz.
      ...(process.env.PERF === '1'
        ? [
            {
              extends: true as const,
              test: {
                name: 'perf',
                testTimeout: 600_000,
                hookTimeout: 600_000,
                environment: 'node' as const,
                include: ['src/**/*.perf.test.ts'],
                globalSetup: ['./src/test/db-global-setup.ts'],
                fileParallelism: false,
              },
            },
          ]
        : []),
    ],
  },
});
