import { expect, test } from './fixture';
import { loginAs } from './login';
import { waitForHydratedControl } from './hydration';

/**
 * Toast, alt gezinmenin üstündeki yapışkan eylem çubuğunun birincil düğmesini örtmez (kart 453; kuru koşu bulgusu: telefonda
 * "Onayların kaydedildi." toast'ı "Doğrulamayı tamamla" düğmesinin üst yarısını örtüyordu). Ortak toast bölgesi çubuğun
 * (`data-action-bar`) üstüne kalkar. Ölçü: toast görünürken düğmenin tıklanabilir alanının her noktasında üstteki öğe düğmenin
 * kendisidir (`elementFromPoint`) ve iki kutu kesişmez. Sahne: mentor ayarları, çubukta tek düğme ("Haftalık saatleri
 * kaydet") tam toast şeridinde durur; eski yerleşimde toast onu örter (başlangıç ekranının "Devam et"i çubuğun üst
 * düğmesi olduğu için bu hatayı göstermez).
 */
test.use({ viewport: { width: 390, height: 844 } });

test('390: toast görünürken yapışkan çubuğun birincil düğmesi örtülmez', async ({ page }) => {
  await loginAs(page, 'alumniMentor');
  await page.goto('/mentor/ayarlar', { waitUntil: 'networkidle' });
  const save = page.getByRole('button', { name: 'Haftalık saatleri kaydet', exact: true });
  await expect(save).toBeVisible();
  await waitForHydratedControl(page, 'Haftalık saatleri kaydet');
  await expect(page.locator('[data-action-bar]')).toHaveCount(1);

  await save.click();
  const toast = page.getByRole('status').locator('p').first();
  await expect(toast).toBeVisible();

  const t = (await toast.boundingBox())!;
  const b = (await save.boundingBox())!;
  expect(t.y, 'toast ekranın içinde').toBeGreaterThanOrEqual(0);
  const overlap =
    t.x < b.x + b.width && t.x + t.width > b.x && t.y < b.y + b.height && t.y + t.height > b.y;
  expect(
    overlap,
    `toast (${Math.round(t.y)}-${Math.round(t.y + t.height)}) düğmeyle (${Math.round(b.y)}-${Math.round(b.y + b.height)}) kesişmemeli`,
  ).toBe(false);
  // Düğmenin köşelerine yakın ve orta noktalarında üstteki öğe düğmenin kendisi (ya da içi).
  const points = [0.1, 0.5, 0.9].flatMap((fx) =>
    [0.1, 0.5, 0.9].map((fy) => [b.x + b.width * fx, b.y + b.height * fy] as const),
  );
  for (const [x, y] of points) {
    const top = await page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px!, py!)?.closest('button')?.textContent?.trim() ?? null,
      [x, y],
    );
    expect(top, `(${Math.round(x)}, ${Math.round(y)}) noktasında düğme üstte olmalı`).toBe(
      'Haftalık saatleri kaydet',
    );
  }
});
