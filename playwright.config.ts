import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { isolationRunId, workerBaseUrl, workerDatabaseUrl } from './tests/e2e/isolation';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.APP_URL) throw new Error('E2E için worktree APP_URL ayarı gerekli.');
const configuredUrl = new URL(process.env.APP_URL);
const port = Number(configuredUrl.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('E2E için APP_URL açık bir worktree portu içermeli.');
}
process.env.E2E_ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
process.env.E2E_ORIGINAL_APP_URL = process.env.APP_URL;
isolationRunId();
mkdirSync('.data', { recursive: true });
for (const index of [0, 1]) {
  writeFileSync(
    `.data/e2e-tsconfig-${index}.json`,
    JSON.stringify({ extends: '../tsconfig.json' }),
  );
}
const baseURL = workerBaseUrl(0);
const webkitMode = process.env.E2E_WEBKIT;
const workersArg =
  process.argv.find((arg) => arg.startsWith('--workers='))?.split('=')[1] ??
  (process.argv.includes('--workers')
    ? process.argv[process.argv.indexOf('--workers') + 1]
    : undefined);
const serverIndices = workersArg === '1' ? [0] : [0, 1];

export default defineConfig({
  testDir: './tests/e2e',
  // Her işçinin kendi seed veritabanı ve uygulama sunucusu vardır.
  workers: 2,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL },
  projects: [
    // `webkit-*.spec.ts` yalnız Safari projesinde koşar; varsayılan çalıştırma (ve CI) değişmez.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /webkit-.*\.spec\.ts/ },
    // İsteğe bağlı Safari (WebKit) + iPhone turu (docs/engineering.md "Test"):
    //  - E2E_WEBKIT=1: proje YALNIZ `webkit-*.spec.ts` dosyalarını koşar; `--project` verilmese bile bütün testler WebKit'e kaymaz.
    //  - E2E_WEBKIT=all: kasıtlı kapı; seçtiğin tek tek spec'leri WebKit'te koşmak için (`--project=webkit-iphone tests/e2e/<dosya>`).
    ...(webkitMode === '1' || webkitMode === 'all'
      ? [
          {
            name: 'webkit-iphone',
            use: { ...devices['iPhone 13'] },
            ...(webkitMode === '1' ? { testMatch: /webkit-.*\.spec\.ts/ } : {}),
          },
        ]
      : []),
  ],
  webServer: serverIndices.map((index) => ({
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${new URL(workerBaseUrl(index)).port}`,
    // Sunucular DB kurulmadan başlar; giriş sayfası DB'ye bağlanmadan hazır olabilir.
    url: `${workerBaseUrl(index)}/giris`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ENV: 'test',
      APP_URL: workerBaseUrl(index),
      DATABASE_URL: workerDatabaseUrl(index),
      E2E_NEXT_INSTANCE: String(index),
    },
  })),
});
