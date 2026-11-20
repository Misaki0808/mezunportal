import { expect, test } from './fixture';
import { waitForFormReady } from './hydration';
import { loginAs } from './login';

test('form hazır bekçisi SSR görünümünü kabul etmez; gerçek istemci bağlanınca etkileşim çalışır', async ({
  page,
}) => {
  await loginAs(page, 'student');
  const scripts = Promise.withResolvers<void>();
  let blocked = 0;
  let ready = false;
  let waiting: Promise<void> | undefined;
  await page.route('**/_next/static/**', async (route) => {
    if (route.request().resourceType() === 'script') {
      blocked++;
      await scripts.promise;
    }
    await route.continue();
  });
  try {
    await page.goto('/hesap/ad-soyad', { waitUntil: 'commit' });
    const field = page.getByLabel('Ad soyad');
    const button = page.getByRole('button', { name: 'Kaydet', exact: true });
    await expect(field).toBeVisible();
    await expect.poll(() => blocked).toBeGreaterThan(0);
    await expect(button.locator('xpath=ancestor::form')).not.toHaveAttribute(
      'data-hydrated',
      'true',
    );
    waiting = waitForFormReady(button).then(() => {
      ready = true;
    });
    // Bir tarayıcı turu boyunca JS kapalı: helper no-op olursa burada erken çözülmüş olur.
    await page.evaluate(() => document.readyState);
    expect(ready).toBe(false);
    scripts.resolve();
    await waiting;
    expect(ready).toBe(true);
    // İşaretin ötesinde gerçek React doğrulaması: tek karakter kaydedilmez, alan hatası ve odak gelir.
    await field.fill('A');
    await button.click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('A');
  } finally {
    scripts.resolve();
    await waiting?.catch(() => undefined);
    await page.unrouteAll({ behavior: 'wait' });
  }
});
