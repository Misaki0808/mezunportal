import { expect, test } from './fixture';
import { loginAs } from './login';

for (const role of ['student', 'alumniMentor', 'departmentAdmin'] as const) {
  test(`${role}: Google yönetim yolu gerçek 404`, async ({ page }) => {
    await loginAs(page, role);
    const response = await page.goto('/yonetim/google');
    expect(response?.status()).toBe(404);
  });
}

test('sistem yöneticisi Google yönetim yolunu açabilir', async ({ page }) => {
  await loginAs(page, 'systemAdmin');
  const response = await page.goto('/yonetim/google');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
