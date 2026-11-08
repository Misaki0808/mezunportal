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

test('karşılama metni JavaScript olmadan sunulur; maketteki örnek bağlantı odak almaz', async ({
  browser,
  page,
  baseURL,
}) => {
  const noScript = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const serverPage = await noScript.newPage();
  await serverPage.goto('/');
  await expect(serverPage.getByRole('heading', { level: 1 })).toContainText('Yolun daha yeni');
  await expect(serverPage.getByRole('link', { name: 'İÜ e-postanla başla' }).first()).toBeVisible();
  await noScript.close();

  await page.goto('/');
  await expect(page.locator('.landing-stage')).toHaveAttribute('inert', '');
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('.landing-stage'))),
    ).toBe(false);
  }
});

test('koyu tema ve sabit kahraman yüzeyi okunabilir kalır', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.landing')).toHaveCSS('background-color', 'rgb(14, 13, 26)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
