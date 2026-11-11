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

test('hareket azaltıldığında içerik görünür ve dönen satır sabit kalır', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const line = page.locator('.landing-rotating-text');
  const first = await line.textContent();
  await page.waitForTimeout(6500);
  expect(await line.textContent()).toBe(first);
  await expect(page.getByRole('heading', { name: 'Üç adımda başlarsın.' })).toBeVisible();
});

test('dönen satır birkaç saniyede değişir; ekran okuyucu yalnız ilk satırı okur', async ({
  page,
}) => {
  await page.goto('/');
  const line = page.locator('.landing-rotating-text');
  const first = (await line.textContent())!;
  await expect(line).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.landing-rotating .sr-only')).toHaveText(first);
  await expect.poll(async () => line.textContent(), { timeout: 9000 }).not.toBe(first);
  await expect(page.locator('.landing-rotating .sr-only')).toHaveText(first);
});

test('karşılama metni JavaScript olmadan sunulur', async ({ browser, baseURL }) => {
  const noScript = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const serverPage = await noScript.newPage();
  await serverPage.goto('/');
  await expect(serverPage.getByRole('heading', { level: 1 })).toContainText(
    'Staj ararken yalnız değilsin.',
  );
  await expect(serverPage.locator('.landing-rotating .sr-only')).toHaveText(
    'Sen giderken dönen arkadaşların var, bir destek alsana?',
  );
  await expect(serverPage.getByRole('link', { name: 'İÜ e-postanla başla' }).first()).toBeVisible();
  await noScript.close();
});

test('Bölümümüz bağlantıları bölümün sayfalarına yeni sekmede, güvenli açılır', async ({
  page,
}) => {
  await page.goto('/');
  const hrefs = [
    'https://mis-iktisat.istanbul.edu.tr/tr/_',
    'https://mis-iktisat.istanbul.edu.tr/tr/akademikkadro',
    'https://www.linkedin.com/company/mis-iktisat/posts/',
    'https://www.instagram.com/mis_iktisat/',
    'https://www.instagram.com/iuybskulubu/',
  ];
  const links = page.locator('#bolumumuz a');
  await expect(links).toHaveCount(hrefs.length);
  for (const [index, href] of hrefs.entries()) {
    const link = links.nth(index);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(
    page.getByText("Bu bir öğrenci projesidir; İstanbul Üniversitesi'nin resmî hizmeti değildir."),
  ).toBeVisible();
});

test('koyu tema (lacivert #0E1A38) ve açık tema (krem) okunabilir kalır', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.landing')).toHaveCSS('background-color', 'rgb(14, 26, 56)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(242, 244, 252)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.landing')).toHaveCSS('background-color', 'rgb(255, 250, 244)');
});
