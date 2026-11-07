import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:3206';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'PORT=3206 pnpm dev',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { APP_ENV: 'test', APP_URL: baseURL },
  },
});
