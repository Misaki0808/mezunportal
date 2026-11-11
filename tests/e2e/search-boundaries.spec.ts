import { loginAs } from './login';
import { expect, test, type Page } from '@playwright/test';

const login = (page: Page) => loginAs(page, 'academic');

test('beş geçersiz filtre bağlantısı çökmeden temizleme sunar', async ({ page }) => {
  await login(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const query of [
    '?page=NaN',
    '?page=-1',
    '?page=999999999',
    '?types=ROCKET',
    '?termYear=oops',
  ]) {
    await page.goto(`/deneyimler${query}`);
    await expect(page.getByRole('heading', { name: 'Filtre bağlantısı geçersiz' })).toBeVisible();
    await page.getByRole('link', { name: 'Filtreleri temizle' }).click();
    await expect(page).toHaveURL(/\/deneyimler$/);
    await expect(page.getByRole('heading', { name: 'Deneyimlere bak' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This page couldn’t load' })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('uzun şirket etiketi 360 ve 390 pikselde kısalır, kaldırma erişilebilir kalır', async ({
  page,
}) => {
  await login(page);
  const company = 'W'.repeat(100);
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/deneyimler?company=${company}`);
    const label = page.getByTitle(company);
    const remove = page.getByRole('button', { name: `${company} etiketini kaldır` });
    await expect(label).toBeVisible();
    await expect(remove).toBeVisible();
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(metrics.scroll).toBe(metrics.viewport);
    const box = await remove.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await label.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  }
  await removeChip(page, company);
});
async function removeChip(page: Page, company: string) {
  await page.getByRole('button', { name: `${company} etiketini kaldır` }).click();
  await expect(page).toHaveURL(/\/deneyimler$/);
}

test('arama yüklenirken düğme kilitlidir', async ({ page }) => {
  await login(page);
  await page.goto('/deneyimler');
  let release!: () => void;
  let seen!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const observed = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route('**/deneyimler?*', async (route) => {
    if (route.request().headers()['rsc'] === '1') {
      seen();
      await blocked;
    }
    await route.continue();
  });
  try {
    await page.getByLabel('Deneyim ara').fill('Teknoloji');
    const submit = page.locator('form button[type=submit]');
    await submit.click();
    await observed;
    await expect.poll(() => submit.evaluate((node: HTMLButtonElement) => node.disabled)).toBe(true);
    await expect(submit).toHaveAttribute('aria-busy', 'true');
  } finally {
    release();
  }
  await expect(page).toHaveURL(/q=Teknoloji/);
});
