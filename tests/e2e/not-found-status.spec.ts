import { expect, test, type Page } from '@playwright/test';
import messages from '../../messages/tr.json' with { type: 'json' };

const NOT_FOUND = messages.ui.errorState.expected.RESOURCE_NOT_FOUND;
const UNKNOWN = '018f0000-0000-7000-8000-000000000000';

async function loginStudent(page: Page) {
  await page.goto('/giris/test?persona=student');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await page.waitForLoadState('networkidle');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}

// Rota grubu `loading.tsx` iskeleti altında fırlatılan notFound() durum kodunu 200'de bırakır (iskelet önce gider).
// Bu yüzden yalnız loading sınırının ÜSTÜNDE karar verilen adresler GERÇEK 404 alır; kalanlarda içerik kontrol edilir.
test('bulunamayan adresler: gerçek 404 + Türkçe ekran (görüşme formu, sınırsız rota, bilinmeyen adres)', async ({
  page,
}) => {
  await loginStudent(page);
  for (const path of [
    `/hesap/gorusme/${UNKNOWN}`,
    `/etkinlikler/${UNKNOWN}`,
    '/boyle-bir-sayfa-yok',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText(NOT_FOUND), path).toBeVisible();
  }
});

test('grup iskeleti altındaki sayfalar (randevu, randevu-al, hikâye): bulunamadı ekranı, form/veri yok', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginStudent(page);
  for (const path of [
    `/randevular/${UNKNOWN}`,
    `/randevu-al/${UNKNOWN}`,
    `/hikayeler/${UNKNOWN}`,
  ]) {
    await page.goto(path);
    // Durum kodu bu rotalarda iskelet nedeniyle 200 olabilir; kararlı olan: içerik "bulunamadı"dır ve etkileşimli form yoktur.
    await expect(page.getByText(NOT_FOUND), path).toBeVisible();
    await expect(page.locator('main form'), path).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /gönder|onayla|kaydet|randevu al/i }),
      path,
    ).toHaveCount(0);
  }
});
