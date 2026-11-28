import { expect, test } from './fixture';
import { waitForFormReady } from './hydration';
import { loginAs } from './login';

/**
 * Kart 572: öğrenci mentor ayarı ve “Günlük hayat” deneyimi (yalnız okuyan sınamalar: ortak e2e veritabanında mentor kapatılmaz,
 * taslak yazılmaz; bırak/dön ve günlük sınır servis testlerindedir).
 */
test('öğrenci mentor ayarında bırak düğmesi var, mezun mentorda yok', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'seniorMentor');
  await page.goto('/mentor/ayarlar');
  await expect(page.getByRole('heading', { name: 'Öğrenci mentorsun' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mentorluğu bırak' })).toBeVisible();
  // Öğrenci mentorda “listede görün” anahtarı yerine bırak/dön bölümü vardır.
  await expect(page.getByRole('switch', { name: /Mentor listesinde görün/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'sayfa yatay taşması (390 px)',
  ).toBeLessThanOrEqual(0);

  await loginAs(page, 'alumniMentor');
  await page.goto('/mentor/ayarlar');
  await expect(page.getByRole('switch', { name: /Mentor listesinde görün/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mentorluğu bırak' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Öğrenci mentorsun' })).toHaveCount(0);
});

test('Günlük hayat: teşvik metni görünür, staja özgü alanlar çıkar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'student');

  await page.goto('/deneyimler');
  await expect(page.getByText(/Her deneyim değerli/)).toBeVisible();

  await page.goto('/deneyim/yeni');
  await waitForFormReady(page.getByRole('button', { name: 'Taslağı kaydet', exact: true }));
  await expect(page.getByText(/Her deneyim değerli/)).toBeVisible();
  await expect(page.getByLabel(/Kurum ya da etkinlik adı/)).toBeVisible();
  await expect(page.getByLabel(/^Ücret/)).toBeVisible();

  await page.getByLabel(/Deneyim türü/).selectOption('DAILY_LIFE');
  await expect(page.getByLabel(/Kurum ya da etkinlik adı/)).toHaveCount(0);
  await expect(page.getByLabel(/^Ücret/)).toHaveCount(0);
  await expect(page.getByLabel(/^Yıl/)).toHaveCount(0);
  await expect(page.getByLabel(/Konu \(isteğe bağlı\)/)).toBeVisible();
  await expect(page.getByLabel(/Neler yaşadın, ne öğrendin/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'sayfa yatay taşması (390 px)',
  ).toBeLessThanOrEqual(0);
});
