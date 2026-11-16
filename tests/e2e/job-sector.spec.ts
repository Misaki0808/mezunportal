import { expect, test } from './fixture';
import { loginAs } from './login';

test('ilan sektör filtresi mobilde uygulanır, URL yenilemede korunur ve masaüstü menüde mezunlara gidilir', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'student');
  await page.goto('/ilanlar');
  await page.getByRole('button', { name: 'Filtreler' }).click();
  const dialog = page.getByRole('dialog', { name: 'Filtreler' });
  const sector = dialog.getByLabel('Sektör');
  await expect(sector.locator('option').filter({ hasText: /^Havacılık$/ })).toHaveCount(1);
  await sector.selectOption({ label: 'Havacılık' });
  const sectorId = await sector.inputValue();
  await dialog.getByRole('button', { name: 'Filtreleri uygula' }).click();
  await expect(page).toHaveURL(new RegExp(`sectorId=${sectorId}`));
  await page.reload();
  await page.getByRole('button', { name: 'Filtreler' }).click();
  await expect(page.getByRole('dialog').getByLabel('Sektör')).toHaveValue(sectorId);
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Yan menü' });
  await expect(nav.getByRole('link', { name: 'Mezunlar' })).toHaveAttribute('href', '/mezunlar');
  await nav.getByRole('link', { name: 'Mezunlar' }).click();
  await expect(page).toHaveURL(/\/mezunlar$/);
});
