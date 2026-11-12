import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.APP_URL) throw new Error('E2E için worktree APP_URL ayarı gerekli.');
const configuredUrl = new URL(process.env.APP_URL);
const port = Number(configuredUrl.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('E2E için APP_URL açık bir worktree portu içermeli.');
}
const baseURL = `http://127.0.0.1:${port}`;
const webkitMode = process.env.E2E_WEBKIT;

export default defineConfig({
  testDir: './tests/e2e',
  // Testler ortak seed hesaplarının rıza ve oturum durumunu değiştirir; eşzamanlı dosyalar yarışır.
  // `--workers=2` gibi bir üst değer global-setup.ts'te açık hatayla reddedilir.
  workers: 1,
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
  webServer: {
    // Doğrudan Next: dev betiğinin yerel env yüklemesi test ortamını değiştiremez.
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ENV: 'test',
      APP_URL: baseURL,
      // pg'nin "client.query() already executing" uyarısı (BACKLOG TD-027, Prisma 7 kaynaklı) dev sunucudan tarayıcıya iletilir ve
      // Next hata katmanı 390 px'te alt gezinmeyi örten "1 Issue" rozeti çizer (tek spec koşusunda tıklamayı keser). Yalnız bu test
      // sunucusunda Node kullanımdan kaldırma uyarıları kapalıdır; normal dev ve birim/DB koşuları uyarıyı görmeye devam eder.
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' '),
    },
  },
});
