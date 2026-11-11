import { expect, type Page } from '@playwright/test';
import type { TEST_LOGIN_PERSONAS } from '../../src/contracts/auth';
type TestLoginPersona = (typeof TEST_LOGIN_PERSONAS)[number];
import { waitForHydratedForm } from './hydration';

/** Test girişi ve zorunlu onay; uygulamanın kendi yönlendirmesini kesen ikinci gezinti yapmaz. */
export async function loginAs(
  page: Page,
  persona: TestLoginPersona,
  options: { returnTo?: string; expectRejected?: boolean } = {},
) {
  const query = new URLSearchParams({ persona });
  if (options.returnTo) query.set('donus', options.returnTo);
  await page.goto(`/giris/test?${query}`);
  await page.waitForLoadState('networkidle');
  const submit = page.getByRole('button', { name: 'Test hesabıyla giriş yap' });
  // Soğuk derlemede SSR düğmesi hidratasyondan önce görünür; ikinci gezinme başlatmadan
  // formun gerçekten yönlendirmeye geçtiğini doğrula.
  await expect(async () => {
    if (new URL(page.url()).pathname === '/giris/test') await submit.click();
    await expect(page).not.toHaveURL(/\/giris\/test(?:\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 20_000, intervals: [500] });
  if (options.expectRejected) {
    await page.waitForURL(/\/giris$/);
    return;
  }
  if (options.returnTo?.startsWith('/') && !options.returnTo.startsWith('//')) {
    const expected = options.returnTo;
    await page.waitForURL((url) => url.pathname === expected || url.pathname === '/onay');
    await page.waitForLoadState('networkidle');
    if (new URL(page.url()).pathname === expected) return;
  }
  // /hesap geçici bir ara URL olabilir: onay veya gerçek hesap içeriği gelene kadar bekle.
  const consent = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  const account = page.getByRole('heading', { name: 'Hesabın', exact: true });
  await expect(account.or(consent.first())).toBeVisible({ timeout: 20_000 });
  if (await consent.first().isVisible()) {
    await waitForHydratedForm(page, 'Seçimlerimi kaydet');
    await consent.nth(0).check();
    await consent.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
    await page.waitForURL((url) => url.pathname !== '/onay');
  }
  // Başarı bildirimi router.replace'den önce çıkabilir; sonraki test adımı bu gezinmeyi kesmemeli.
  await page.waitForLoadState('networkidle');
}
