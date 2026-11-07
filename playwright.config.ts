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

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Doğrudan Next: dev betiğinin yerel env yüklemesi test ortamını değiştiremez.
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { APP_ENV: 'test', APP_URL: baseURL },
  },
});
