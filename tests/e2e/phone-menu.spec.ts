import { expect, test } from './fixture';
import { loginAs } from './login';

// Kart 387: telefon alt çubuğu = dört sekme + "Menü" alt sayfası. 390 px'te her ekrana alt çubuktan ya da Menü'den ulaşılır;
// alt sayfa klavye ve ekran okuyucuyla kullanılır (odak hapsi, Esc, kapatınca odak geri döner).
test.describe('telefon alt çubuğu ve Menü (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('her ekrana alt çubuktan ya da Menü alt sayfasından ulaşılır; sayfa açıkken ilgili öğe etkin görünür', async ({
    page,
  }) => {
    await loginAs(page, 'student');
    await page.goto('/', { waitUntil: 'networkidle' });
    const bottom = page.getByRole('navigation', { name: 'Ana gezinme' });
    for (const [name, path] of [
      ['İlanlar', '/ilanlar'],
      ['Mentorlar', '/mentorlar'],
      ['Randevular', '/randevular'],
      ['Ana sayfa', '/'],
    ] as const) {
      await bottom.getByRole('link', { name }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      await expect(bottom.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
      await expect(bottom.getByRole('button', { name: 'Menü' })).not.toHaveAttribute(
        'aria-current',
        'true',
      );
    }
    const menu = bottom.getByRole('button', { name: 'Menü' });
    for (const [name, path] of [
      ['Deneyimler', '/deneyimler'],
      ['Mezunlar', '/mezunlar'],
      ['Etkinlikler', '/etkinlikler'],
      ['Ders rehberi', '/ders-rehberi'],
      ['Bildirimler', '/bildirimler'],
      ['Profilim', '/profil'],
      ['Hesap ayarları', '/hesap'],
    ] as const) {
      await menu.click();
      const sheet = page.getByRole('dialog', { name: 'Menü' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('link', { name: new RegExp(`^${name}`) }).click();
      await expect.poll(() => new URL(page.url()).pathname, name).toBe(path);
      // Alt sayfa kapanır; Menü düğmesi etkin, hiçbir alt çubuk sekmesi etkin değildir.
      await expect(page.getByRole('dialog', { name: 'Menü' })).toHaveCount(0);
      await expect(menu).toHaveAttribute('aria-current', 'true');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('klavye: Enter açar, odak alt sayfada kalır (Tab döngüsü), Esc kapatır ve odak Menü düğmesine döner', async ({
    page,
  }) => {
    await loginAs(page, 'student');
    await page.goto('/', { waitUntil: 'networkidle' });
    const menu = page
      .getByRole('navigation', { name: 'Ana gezinme' })
      .getByRole('button', { name: 'Menü' });
    await menu.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Menü' });
    await expect(sheet).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    // Odak hapsi: art arda Tab ve Shift+Tab'te odak her zaman alt sayfanın içindedir.
    for (const key of [
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Shift+Tab',
      'Shift+Tab',
    ]) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(
        true,
      );
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Menü' })).toHaveCount(0);
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('bilgisayar genişliğinde alt çubuk ve Menü yoktur (yan menü vardır)', async ({ page }) => {
    await loginAs(page, 'student');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-bottom-nav]')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Yan menü' })).toBeVisible();
  });
});
