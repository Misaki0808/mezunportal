import { expect, test } from '@playwright/test';

test('girişsiz karşılama ekranının birincil eylemi girişe götürür', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  const heading = page.getByRole('heading', { level: 1 });
  const action = page.getByRole('link', { name: 'İÜ e-postanla başla' }).first();
  await expect(heading).toBeVisible();
  const box = await action.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(780);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await action.click();
  await expect(page).toHaveURL(/\/giris$/);
});

test('hareket azaltıldığında içerik görünür ve animasyon durur', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.landing-hero-wave')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('heading', { name: /üç adım kadar yakın/i })).toBeVisible();
});
