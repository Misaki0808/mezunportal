import { expect, test } from './fixture';

test('ana sayfa açılır', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
