import { randomUUID } from 'node:crypto';
import { startEmailWorker, stopEmailWorker } from './email-worker';
import { expect, test, type Page } from './fixture';
import { loginAs } from './login';
import { waitForHydratedForm } from './hydration';
import messages from '../../messages/tr.json' with { type: 'json' };

/**
 * Toast, alt gezinmenin üstündeki yapışkan eylem çubuğunun hiçbir düğmesini örtmez (kart 453; kuru koşu bulgusu: telefonda
 * "Onayların kaydedildi." toast'ı "Doğrulamayı tamamla" düğmesinin üst yarısını örtüyordu). Çubuk (`ActionBar`) kendi
 * yüksekliğini `--action-bar-h` değişkenine yazar, toast bölgesi alt konumunu CSS'te bu değişkenle hesaplar. Ölçü SON
 * konumda yapılır: çubuktaki HER düğme ve bağlantının dokunma alanında üstteki öğe kendisidir (`elementFromPoint`) ve toast
 * kutusuyla kesişmez (R2 455 B1–B3: özgün üyelik formu, rota değişimi, kaydırma sonrası).
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Çubuktaki her düğme/bağlantı için toast kutusuyla kesişim ve örtülü nokta sayısı (9 nokta). */
async function barState(
  page: Page,
  toastBox: { x: number; y: number; width: number; height: number },
) {
  const controls = await page.evaluate(() => {
    const bar = document.querySelector('[data-action-bar]');
    if (!bar) return [];
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
  return controls.map((c) => ({
    ...c,
    overlap:
      toastBox.x < c.x + c.width &&
      toastBox.x + toastBox.width > c.x &&
      toastBox.y < c.y + c.height &&
      toastBox.y + toastBox.height > c.y,
  }));
}
async function expectClear(page: Page, toast: ReturnType<Page['getByText']>, when: string) {
  const box = (await toast.boundingBox())!;
  expect(box.y, `${when}: toast ekranın içinde`).toBeGreaterThanOrEqual(0);
  const controls = await barState(page, box);
  expect(controls.length, `${when}: çubukta düğme var`).toBeGreaterThan(0);
  for (const c of controls) {
    expect(
      c.overlap,
      `${when}: toast (${Math.round(box.y)}-${Math.round(box.y + box.height)}) "${c.name}" ile (${Math.round(c.y)}-${Math.round(c.y + c.height)}) kesişmemeli`,
    ).toBe(false);
    expect(c.covered, `${when}: "${c.name}" düğmesinin ${c.covered}/9 noktası örtülü`).toBe(0);
  }
}

test('390: başlangıç çubuğu, toast görünürken, kaydırınca ve rota değişince örtülmez', async ({
  page,
}) => {
  await loginAs(page, 'student');
  await page.goto('/baslangic', { waitUntil: 'networkidle' });
  await waitForHydratedForm(page, messages.accountName.save);
  await expect(page.getByRole('button', { name: 'Devam et', exact: true })).toBeVisible();
  await expect(page.locator('[data-action-bar]')).toHaveCount(1);

  await page.getByRole('textbox', { name: messages.accountName.label }).fill('Deniz Yılmaz');
  await page.getByRole('button', { name: messages.accountName.save, exact: true }).click();
  const toast = page.getByRole('status').getByText(messages.accountName.saved);
  await expect(toast).toBeVisible();
  await expectClear(page, toast, 'ilk anda');

  // B3: kaydırma bittikten sonra da (son konumda) örtülmez.
  await page.evaluate(() => window.scrollBy(0, 24));
  await page.waitForTimeout(700);
  await expectClear(page, toast, 'kaydırma sonrası');

  // B2 (çubuklu → çubuksuz): toast açıkken çubuksuz sayfaya geçince değişken silinir, toast ana konumuna döner.
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('link', { name: 'İlanlar', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ilanlar/);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--action-bar-h')),
    )
    .toBe('');
  if (await toast.isVisible()) {
    const box = (await toast.boundingBox())!;
    expect(box.y + box.height, 'toast alt gezinme üstündeki ana konumda').toBeGreaterThan(740);
  }
});

test('390: özgün senaryo: üyelik formunda "Onayların kaydedildi." toast\'ı "Doğrulamayı tamamla"yı örtmez', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 253) + 1}`,
  });
  const worker = startEmailWorker();
  try {
    const email = `toast-${randomUUID()}@ogr.iu.edu.tr`;
    await page.goto('/');
    await page.getByRole('link', { name: 'İÜ e-postanla başla' }).first().click();
    await expect(page).toHaveURL(/\/giris$/);
    await waitForHydratedForm(page, 'Giriş bağlantısı gönder');
    await page.getByLabel('E-posta adresi').fill(email);
    await page.getByRole('button', { name: 'Giriş bağlantısı gönder' }).click();
    await expect(page).toHaveURL(/\/giris\/epostani-kontrol-et$/);
    let link: string | undefined;
    await expect
      .poll(
        async () => {
          const list = await (
            await fetch(
              `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
            )
          ).json();
          const message = list.messages?.find((entry: { To: { Address: string }[] }) =>
            entry.To.some((to) => to.Address.toLowerCase() === email),
          );
          if (message) {
            const detail = await (
              await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)
            ).json();
            link = (detail.Text as string)
              .match(/https?:\/\/[^\s<>]+/g)
              ?.find((url) => url.includes('/magic-link/verify'));
          }
          return Boolean(link);
        },
        { timeout: 30_000, message: 'Yerel Mailpit üzerinde giriş bağlantısı alınamadı.' },
      )
      .toBe(true);
    const url = new URL(link!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== new URL(page.url()).port)
      throw new Error('Bağlantı bu worktree sunucusuna ait değil.');
    expect((await context.request.get(link!, { maxRedirects: 0 })).status()).toBe(302);
    await page.goto('/');
    await expect(page).toHaveURL(/\/onay(?:\?.*)?$/);
    await waitForHydratedForm(page, 'Seçimlerimi kaydet');
    const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await required.nth(0).check();
    await required.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('link', { name: 'Doğrulamaya git' }).click();
    await expect(page).toHaveURL(/\/dogrulama\/uyelik$/);
    await waitForHydratedForm(page, 'Doğrulamayı tamamla');
    // Onay toast'ı (6 sn) formda hâlâ açıkken: düğme örtülmez. Toast akış yavaşsa kaybolmuş olabilir; o durumda test açık hata verir.
    const toast = page.getByRole('status').getByText(messages.privacyScreens.consent.saved);
    await expect(toast, "onay toast'ı formda hâlâ açık (akış 6 sn'den hızlı olmalı)").toBeVisible({
      timeout: 2000,
    });
    await expect(page.locator('[data-action-bar]')).toHaveCount(1);
    await expectClear(page, toast, 'üyelik formu');
  } finally {
    await stopEmailWorker(worker);
  }
});
