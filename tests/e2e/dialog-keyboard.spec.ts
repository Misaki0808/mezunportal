import { loginAs } from './login';
import { expect, test, type Page } from '@playwright/test';

/** Ortak pencerede (Modal/Sheet) klavye: Tab içeride döner, Shift+Tab geri döner, Esc kapatır ve odak tetikleyiciye döner. */
const loginAdmin = (page: Page) => loginAs(page, 'systemAdmin');

const insideDialog = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    const dialog = document.querySelector('dialog[open]');
    return Boolean(dialog && active && dialog.contains(active));
  });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`pencere klavyesi ${viewport.width}px: Tab içeride döner, Esc tetikleyiciye döner`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await loginAdmin(page);
    await page.goto('/yonetim/kullanicilar');
    await page
      .getByRole('link', { name: /^Ayrıntıyı aç: / })
      .first()
      .click();
    const trigger = page.getByRole('button', { name: 'Hesabı askıya al' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await insideDialog(page), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await insideDialog(page), `Shift+Tab ${i + 1}`).toBe(true);
    }
    // Son eylemden Tab ilk kontrole döner.
    await dialog.getByRole('button', { name: 'Onayla' }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Kapat' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Onayla' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}
