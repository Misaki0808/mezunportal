import { expect, test } from './fixture';
import { loginAs } from './login';

test('büyük yazıda mobil üst çubuk sarılır, eylemler ekranda kalır', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'student');
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const header = page.getByRole('banner');
  for (const control of [
    header.getByRole('link', { name: 'MezunPortal' }),
    header.getByRole('button', { name: /temaya geç/ }),
    header.getByRole('link', { name: /Bildirim/ }),
    header.getByRole('link', { name: 'Hesabım' }),
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('büyük yazıda deneyim formu bölüm metinleri sayfayı taşırmaz', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'student');
  await page.goto('/deneyim/yeni');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('heading', { name: 'Deneyim yaz' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
