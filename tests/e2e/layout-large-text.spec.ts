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
  const labels = await page.locator('[data-bottom-nav] li').evaluateAll((items) =>
    items.map((item) => {
      const control = item.querySelector('a,button')!;
      const label = control.querySelector('span')!;
      const bounds = control.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      return {
        left: text.left - bounds.left,
        right: bounds.right - text.right,
        width: label.clientWidth,
        scroll: label.scrollWidth,
      };
    }),
  );
  expect(labels).toHaveLength(5);
  for (const label of labels) {
    expect.soft(label.left).toBeGreaterThanOrEqual(-1);
    expect.soft(label.right).toBeGreaterThanOrEqual(-1);
    expect.soft(label.scroll).toBeLessThanOrEqual(label.width + 1);
  }
  const bottom = await page.evaluate(() => ({
    navigation: document.querySelector('[data-bottom-nav]')!.getBoundingClientRect().height,
    padding: parseFloat(getComputedStyle(document.querySelector('main')!).paddingBottom),
  }));
  expect(bottom.navigation).toBeLessThanOrEqual(bottom.padding);
  const cards = page.locator('dl[aria-label="Günün özeti"] > div');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const bounds = await card.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(160);
  }
});

test('büyük yazıda deneyim formu bölüm metinleri sayfayı taşırmaz', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'student');
  await page.goto('/deneyim/yeni');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('heading', { name: 'Deneyim yaz' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
