import { expect, test } from '@playwright/test';
import { waitForHydratedControl, waitForHydratedForm } from './hydration';

test('öğrenci oturumuyla ilk giriş ekranları 390 px’te tamamlanır (sahte servis)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/giris/test?persona=student');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await waitForHydratedForm(page, 'Seçimlerimi kaydet');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
  await page.goto('/baslangic/test');
  await waitForHydratedControl(page, 'Devam et');
  await page.getByRole('checkbox', { name: 'Yazılım geliştirme' }).check();
  await page.getByRole('checkbox', { name: 'Akademik kariyer' }).check();
  await page.getByRole('button', { name: 'Devam et' }).click();
  await expect(page.getByRole('heading', { name: 'Birlikte neyi hedefleyelim?' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Staj bulmak' }).check();
  await page.getByRole('button', { name: 'Devam et' }).click();
  await expect(
    page.getByRole('heading', { name: 'Gizlilik tercihlerini gözden geçir' }),
  ).toBeVisible();
  await page.getByLabel('LinkedIn').selectOption('PRIVATE');
  await page.getByRole('button', { name: 'Tercihlerimi gözden geçirdim' }).click();
  await page.getByRole('button', { name: 'Başlangıcı tamamla' }).click();
  await expect(page.getByRole('heading', { name: 'Hazırsın!' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
