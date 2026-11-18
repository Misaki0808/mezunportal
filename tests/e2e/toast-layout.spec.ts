import { expect, test } from './fixture';
import { loginAs } from './login';
import { waitForHydratedForm } from './hydration';
import messages from '../../messages/tr.json' with { type: 'json' };

/**
 * Toast, alt gezinmenin üstündeki yapışkan eylem çubuğunun birincil düğmesini örtmez (kart 453; kuru koşu bulgusu: telefonda
 * "Onayların kaydedildi." toast'ı "Doğrulamayı tamamla" düğmesinin üst yarısını örtüyordu). Ortak toast bölgesi çubuğun
 * (`data-action-bar`) üstüne kalkar. Ölçü: toast görünürken düğmenin tıklanabilir alanının her noktasında üstteki öğe düğmenin
 * kendisidir (`elementFromPoint`) ve iki kutu kesişmez. Başlangıç ekranı: adı kaydedince toast çıkar, "Devam et" çubukta.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('390: toast görünürken yapışkan çubuğun birincil düğmesi örtülmez', async ({ page }) => {
  await loginAs(page, 'student');
  await page.goto('/baslangic', { waitUntil: 'networkidle' });
  await waitForHydratedForm(page, messages.accountName.save);
  const primary = page.getByRole('button', { name: 'Devam et', exact: true });
  await expect(primary).toBeVisible();
  const bar = page.locator('[data-action-bar]');
  await expect(bar).toHaveCount(1);

  const name = page.getByRole('textbox', { name: messages.accountName.label });
  await name.fill('Deniz Yılmaz');
  await page.getByRole('button', { name: messages.accountName.save, exact: true }).click();
  const toast = page.getByRole('status').getByText(messages.accountName.saved);
  await expect(toast).toBeVisible();

  const t = (await toast.boundingBox())!;
  const b = (await primary.boundingBox())!;
  expect(t.y, 'toast ekranın içinde').toBeGreaterThanOrEqual(0);
  const overlap =
    t.x < b.x + b.width && t.x + t.width > b.x && t.y < b.y + b.height && t.y + t.height > b.y;
  expect(
    overlap,
    `toast (${Math.round(t.y)}-${Math.round(t.y + t.height)}) düğmeyle (${Math.round(b.y)}-${Math.round(b.y + b.height)}) kesişmemeli`,
  ).toBe(false);
  // Düğmenin köşelerine yakın ve orta noktalarında üstteki öğe düğmenin kendisi (ya da içi).
  const points = [0.1, 0.5, 0.9].flatMap((fx) =>
    [0.1, 0.5, 0.9].map((fy) => [b.x + b.width * fx, b.y + b.height * fy]),
  );
  for (const [x, y] of points) {
    const top = await page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px!, py!)?.closest('button')?.textContent?.trim() ?? null,
      [x, y],
    );
    expect(top, `(${Math.round(x!)}, ${Math.round(y!)}) noktasında düğme üstte olmalı`).toBe(
      'Devam et',
    );
  }
});
