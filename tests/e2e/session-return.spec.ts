import { loginAs } from './login';
import { expect, test } from './fixture';

/**
 * Oturum düşmüşken (çerezler yok) bir sunucu eylemi gönderilince kullanıcı `/giris?donus=<bulunduğu yol>` adresine
 * gider; girişten sonra aynı sayfaya döner (ortak `failAction`, kart 116). Açık yönlendirme `?donus=` güvenli
 * yol dışında yok sayılır.
 */
const signIn = (page: import('@playwright/test').Page, query = '') =>
  loginAs(page, 'student', { returnTo: new URLSearchParams(query).get('donus') ?? undefined });

test('oturum düşmüşken eylem gönderilince girişe, giriş sonrası aynı sayfaya dönülür', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await page.goto('/hesap/bildirimler');
  const optional = page.getByRole('switch', { name: /İletişim talepleri/ });
  await expect(optional).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Oturum sunucuda düşmüş gibi: çerezler silinir, sayfa açık kalır.
  await context.clearCookies();
  await optional.click();
  await page.getByRole('button', { name: 'Tercihleri kaydet' }).click();
  await page.waitForURL(/\/giris\?donus=/);
  expect(new URL(page.url()).searchParams.get('donus')).toBe('/hesap/bildirimler');

  // Giriş (test kişisi, aynı dönüş yoluyla) → aynı sayfa.
  await signIn(page, `&donus=${encodeURIComponent('/hesap/bildirimler')}`);
  await page.waitForURL(/\/hesap\/bildirimler$/);
  await expect(page.getByRole('switch', { name: /İletişim talepleri/ })).toBeVisible();
});

test('dış adres dönüş yolu olarak kabul edilmez', async ({ page }) => {
  await signIn(page, `&donus=${encodeURIComponent('https://kotu.example/x')}`);
  await page.waitForURL(/\/(hesap|onay)$/);
  expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL!).origin);
});
