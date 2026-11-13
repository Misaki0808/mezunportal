import { test as base } from '@playwright/test';
import { workerBaseUrl, workerDatabaseUrl } from './isolation';

// Playwright işçi sürecinde dosya yüklenmeden önce parallelIndex'i sağlar. Böylece dosya
// seviyesindeki Prisma istemcileri ve testin başlattığı alt süreçler aynı yalıtılmış DB'yi kullanır.
if (process.env.TEST_PARALLEL_INDEX !== undefined) {
  const index = Number(process.env.TEST_PARALLEL_INDEX);
  process.env.DATABASE_URL = workerDatabaseUrl(index);
  process.env.APP_URL = workerBaseUrl(index);
}

export const test = base.extend({
  baseURL: async ({}, provide, info) => {
    await provide(workerBaseUrl(info.parallelIndex));
  },
});
export { devices, expect } from '@playwright/test';
export type { Page } from '@playwright/test';
