import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, persona: 'student') {
  await page.goto(`/giris/test?persona=${persona}`);
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

test('mentor bul: liste, mobil filtre alt sayfası, çip, boş durum ve geçersiz adres', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'student');
  await page.goto('/mentorlar');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Mentor bul' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mert Yıldız' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elif Kaya' })).toBeVisible();
  // E-posta ve telefon kartta yok.
  expect(await page.locator('article').allInnerTexts()).not.toContainEqual(
    expect.stringMatching(/@|\+90/),
  );

  // Mobilde alt sayfa: geçersiz girdi alt sayfayı kapatmaz, hata alanın altında görünür.
  await page.getByRole('button', { name: 'Filtreler' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Şirket').fill('a');
  await sheet.getByRole('button', { name: 'Uygula' }).click();
  await expect(sheet.getByText('En az 2 karakter yaz.')).toBeVisible();
  await sheet.getByLabel('Şirket').fill('');
  await sheet.getByRole('checkbox', { name: 'Mezun', exact: true }).check();
  await sheet.getByRole('switch', { name: /Yalnız müsait olanlar/ }).check();
  await sheet.getByRole('button', { name: 'Uygula' }).click();
  await expect(page).toHaveURL(
    /mentorTypes=ALUMNI.*onlyAvailable=1|onlyAvailable=1.*mentorTypes=ALUMNI/,
  );
  await expect(page.getByRole('heading', { name: 'Mert Yıldız' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elif Kaya' })).toHaveCount(0);
  await expect(page.getByText('1 sonuç')).toBeVisible();

  // Çip tek dokunuşla kalkar.
  await page.getByRole('button', { name: 'Mezun etiketini kaldır' }).click();
  await expect(page.getByRole('heading', { name: 'Elif Kaya' })).toBeVisible();

  // Boş durum yönlendirir; temizle listeyi geri getirir.
  await page.goto('/mentorlar?company=yokboylebirsirket');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Bu filtrelerle mentor bulunamadı')).toBeVisible();
  await page.getByRole('button', { name: 'Filtreleri temizle' }).first().click();
  await expect(page.getByRole('heading', { name: 'Mert Yıldız' })).toBeVisible();

  // Geçersiz adres çökmez: anlaşılır hata + temizle bağlantısı.
  await page.goto('/mentorlar?page=abc');
  await expect(page.getByRole('link', { name: 'Filtreleri temizle' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Profil bağlantısı mentorun profiline gider.
  await page.goto('/mentorlar');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Profili gör' }).first().click();
  await expect(page).toHaveURL(/\/uye\/[A-Za-z0-9-]+$/);
});
