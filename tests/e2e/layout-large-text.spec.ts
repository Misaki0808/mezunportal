import { expect, test } from './fixture';
import { loginAs } from './login';

for (const width of [320, 390]) {
  test(`büyük yazıda ${width} px ana sayfa ve gezinme taşmaz`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAs(page, 'student');
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.getByText('Henüz planlanmış görüşmen yok.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kısayollar' })).toBeVisible();
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
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
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
          height: text.height,
          lineHeight: parseFloat(getComputedStyle(label).lineHeight),
          fontSize: parseFloat(getComputedStyle(label).fontSize),
        };
      }),
    );
    expect(labels).toHaveLength(5);
    for (const label of labels) {
      expect.soft(label.left).toBeGreaterThanOrEqual(-1);
      expect.soft(label.right).toBeGreaterThanOrEqual(-1);
      expect.soft(label.scroll).toBeLessThanOrEqual(label.width + 1);
      expect.soft(label.height).toBeLessThanOrEqual(label.lineHeight + 1);
      expect.soft(label.fontSize).toBeGreaterThanOrEqual(12);
    }
    const bottom = await page.evaluate(() => ({
      navigation: document.querySelector('[data-bottom-nav]')!.getBoundingClientRect().height,
      padding: parseFloat(getComputedStyle(document.querySelector('main')!).paddingBottom),
    }));
    expect(bottom.navigation).toBeLessThanOrEqual(bottom.padding);
    await page.locator('[data-bottom-nav]').evaluate((nav) => {
      (nav as HTMLElement).style.paddingBottom = '80px';
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const navigation = document
            .querySelector('[data-bottom-nav]')!
            .getBoundingClientRect().height;
          const padding = parseFloat(
            getComputedStyle(document.querySelector('main')!).paddingBottom,
          );
          return Math.ceil(navigation) - padding;
        }),
      )
      .toBeLessThanOrEqual(0);
    const cards = page.locator('dl[aria-label="Günün özeti"] > div');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const bounds = await card.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(160);
    }
  });
}

test('büyük yazıda deneyim formu bölüm metinleri sayfayı taşırmaz', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'student');
  await page.goto('/deneyim/yeni');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByRole('heading', { name: 'Deneyim yaz' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
