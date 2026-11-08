import { expect, test, type Page } from '@playwright/test';

/** "İçeriğe geç" bağlantısı odaklanınca markaya (logo/üst çubuk) binmemeli (R1 P2, 1440). */
type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function loginStudent(page: Page) {
  await page.goto('/giris/test?persona=student');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
}

for (const width of [390, 1440]) {
  test(`uygulama kabuğu ${width}px: atlama bağlantısı markaya binmez`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginStudent(page);
    await page.goto('/hesap');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'İçeriğe geç' });
    await expect(skip).toBeFocused();
    const skipBox = (await skip.boundingBox())!;
    // Marka iki yerde olabilir (mobil üst çubuk / masaüstü kenar çubuğu); görünür olan ölçülür.
    const brand = page.getByText('MezunPortal', { exact: true }).locator('visible=true').first();
    await expect(brand).toBeVisible();
    const brandBox = (await brand.boundingBox())!;
    expect(
      intersects(skipBox, brandBox),
      `skip=${JSON.stringify(skipBox)} brand=${JSON.stringify(brandBox)}`,
    ).toBe(false);
  });

  test(`tanıtım sayfası ${width}px: atlama bağlantısı markaya ve üst çubuğa binmez`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const skip = page.locator('.landing-skip');
    await expect(skip).toBeFocused();
    const skipBox = (await skip.boundingBox())!;
    const header = (await page.locator('.landing-header').boundingBox())!;
    const brandBox = (await page.locator('.landing-brand').first().boundingBox())!;
    expect(intersects(skipBox, brandBox)).toBe(false);
    expect(skipBox.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  });
}
