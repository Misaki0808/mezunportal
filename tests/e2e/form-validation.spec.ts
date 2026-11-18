import { expect, test } from './fixture';
import { loginAs } from './login';

test('ad soyad: NFD üst sınır, uzunluk ve geçersiz karakter hataları veri kaybetmez', async ({
  page,
}) => {
  await loginAs(page, 'student');
  await page.goto('/hesap/ad-soyad');
  const name = page.getByLabel('Ad soyad');
  const save = page.getByRole('button', { name: 'Kaydet' });
  await name.fill('  ');
  await save.click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAccessibleDescription(/2–80 karakter/);

  await name.fill('I\u0307'.repeat(80));
  await save.click();
  await expect(page.getByText('Adın güncellendi.')).toBeVisible();
  await expect(name).toHaveValue('İ'.repeat(80));
  await page.reload();
  await expect(name).toHaveValue('İ'.repeat(80));

  for (const invalid of ['A'.repeat(81), 'Ayşe 😀']) {
    await name.fill(invalid);
    await save.click();
    await expect(name).toBeFocused();
    await expect(name).toHaveValue(invalid);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(/2–80 karakter/);
  }
});

test('profil bağlantısı: tehlikeli URL alan hatası verir ve veri korunur', async ({ page }) => {
  await loginAs(page, 'student');
  await page.goto('/profil');
  const section = page
    .getByRole('heading', { name: 'Bağlantılar' })
    .locator('xpath=ancestor::section[1]');
  await section.getByRole('button', { name: 'Düzenle' }).click();
  const sheet = page.getByRole('dialog');
  const url = sheet.getByLabel(/LinkedIn adresi/);
  await url.fill('javascript:alert(1)');
  await sheet.getByRole('button', { name: 'Kaydet' }).click();
  await expect(url).toHaveValue('javascript:alert(1)');
  await expect(url).toBeFocused();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(url).toHaveAccessibleDescription(/geçerli/i);
});

test('mentor kapasitesinde sınır dışı ve harf içeren değer kesilmeden reddedilir', async ({
  page,
}) => {
  await loginAs(page, 'alumniMentor');
  await page.goto('/mentor/ayarlar');
  const capacity = page.getByLabel(/Aylık görüşme kapasitesi/);
  const save = page.getByRole('button', { name: 'Genel ayarları kaydet' });
  for (const value of ['41', '100', '4a']) {
    await capacity.fill(value);
    await save.click();
    await expect(capacity).toHaveValue(value);
    await expect(capacity).toBeFocused();
    await expect(capacity).toHaveAttribute('aria-invalid', 'true');
    await expect(capacity).toHaveAccessibleDescription(/1 ile 40/);
  }
  await capacity.fill('40');
  await save.click();
  await expect(page.getByText('Kaydedildi.')).toBeVisible();
});
