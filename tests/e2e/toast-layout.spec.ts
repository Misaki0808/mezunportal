import { expect, test } from './fixture';
import { loginAs } from './login';
import { waitForHydratedForm } from './hydration';
import messages from '../../messages/tr.json' with { type: 'json' };

/**
 * Toast, alt gezinmenin üstündeki yapışkan eylem çubuğunun hiçbir düğmesini örtmez (kart 453; kuru koşu bulgusu: telefonda
 * "Onayların kaydedildi." toast'ı "Doğrulamayı tamamla" düğmesinin üst yarısını örtüyordu). Ortak toast bölgesi çubuğun
 * (`data-action-bar`) üstüne kalkar. Ölçü: toast görünürken çubuktaki HER düğme ve bağlantının dokunma alanında üstteki öğe
 * kendisidir (`elementFromPoint`) ve toast kutusuyla kesişmez. Sahne: başlangıç ekranında adı kaydedince toast çıkar; çubukta
 * "Devam et" ve altında "Şimdilik atla" var, eski yerleşimde toast "Şimdilik atla"yı örter.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('390: toast görünürken yapışkan çubuğun hiçbir düğmesi örtülmez', async ({ page }) => {
  await loginAs(page, 'student');
  await page.goto('/baslangic', { waitUntil: 'networkidle' });
  await waitForHydratedForm(page, messages.accountName.save);
  await expect(page.getByRole('button', { name: 'Devam et', exact: true })).toBeVisible();
  await expect(page.locator('[data-action-bar]')).toHaveCount(1);

  await page.getByRole('textbox', { name: messages.accountName.label }).fill('Deniz Yılmaz');
  await page.getByRole('button', { name: messages.accountName.save, exact: true }).click();
  const toast = page.getByRole('status').getByText(messages.accountName.saved);
  await expect(toast).toBeVisible();

  const t = (await toast.boundingBox())!;
  expect(t.y, 'toast ekranın içinde').toBeGreaterThanOrEqual(0);
  const controls = await page.evaluate(() => {
    const bar = document.querySelector('[data-action-bar]')!;
    return [...bar.querySelectorAll('button, a')].map((el) => {
      const r = el.getBoundingClientRect();
      const points = [0.1, 0.5, 0.9].flatMap((fx) =>
        [0.1, 0.5, 0.9].map((fy) => [r.x + r.width * fx, r.y + r.height * fy] as const),
      );
      const covered = points.filter(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('button, a') !== el,
      ).length;
      return {
        name: (el.textContent ?? '').trim(),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        covered,
      };
    });
  });
  expect(controls.length, 'çubukta düğme var').toBeGreaterThan(1);
  for (const c of controls) {
    const overlap =
      t.x < c.x + c.width && t.x + t.width > c.x && t.y < c.y + c.height && t.y + t.height > c.y;
    expect(
      overlap,
      `toast (${Math.round(t.y)}-${Math.round(t.y + t.height)}) "${c.name}" düğmesiyle (${Math.round(c.y)}-${Math.round(c.y + c.height)}) kesişmemeli`,
    ).toBe(false);
    expect(c.covered, `"${c.name}" düğmesinin ${c.covered}/9 noktası örtülü`).toBe(0);
  }
});
