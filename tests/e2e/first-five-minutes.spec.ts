import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { waitForHydratedControl, waitForHydratedForm } from './hydration';

test('yeni öğrenci e-posta doğrulamasından ilk deneyim listesine ulaşır', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const testIp = `198.51.100.${Math.floor(Math.random() * 253) + 1}`;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': testIp });
  const worker = spawn(
    process.execPath,
    ['--conditions=react-server', '--import', 'tsx', 'src/server/jobs/email-worker.ts'],
    {
      env: {
        ...process.env,
        APP_ENV: 'local',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
      },
      stdio: 'ignore',
    },
  );
  const stopped = new Promise<void>((resolve) => worker.once('exit', () => resolve()));
  try {
    const email = `first-five-${randomUUID()}@ogr.iu.edu.tr`;
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
          const response = await fetch(
            `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          );
          const list = await response.json();
          const message = list.messages?.find((entry: { To: { Address: string }[] }) =>
            entry.To.some((recipient) => recipient.Address.toLowerCase() === email),
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
    if (!link) throw new Error('Giriş bağlantısı bulunamadı.');
    const url = new URL(link);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== new URL(page.url()).port)
      throw new Error('Bağlantı bu worktree sunucusuna ait değil.');
    const verified = await context.request.get(link, { maxRedirects: 0 });
    expect(verified.status()).toBe(302);
    const replayContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': testIp },
    });
    try {
      const repeated = await replayContext.request.get(link, { maxRedirects: 0 });
      expect(repeated.status()).toBe(302);
      expect(repeated.headers().location).toContain('AUTH_LINK_INVALID');
    } finally {
      await replayContext.close();
    }
    await page.goto('/');
    await expect(page).toHaveURL(/\/onay(?:\?.*)?$/);
    await waitForHydratedForm(page, 'Seçimlerimi kaydet');
    const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await required.nth(0).check();
    await required.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page).not.toHaveURL(/\/onay/);
    await page.goto('/');
    await page.getByRole('link', { name: 'Doğrulamaya git' }).click();
    await expect(page).toHaveURL(/\/dogrulama$/);
    await page.getByRole('link', { name: 'Üyeliğini doğrula' }).click();
    await waitForHydratedForm(page, 'Doğrulamayı tamamla');
    await page.getByLabel('Bölüm').selectOption({ index: 1 });
    await page.getByLabel('Üniversiteye giriş yılı').fill('2024');
    await page.getByRole('button', { name: 'Doğrulamayı tamamla' }).click();
    await expect(page.getByText('Üyeliğin doğrulandı.')).toBeVisible();
    await page.getByRole('link', { name: 'Durumu gör' }).click();
    await page.getByRole('link', { name: 'Ana sayfaya dön' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('link', { name: /Profilini tamamla/ }).click();
    await waitForHydratedControl(page, 'Devam et');
    await page.getByRole('checkbox', { name: 'Yazılım geliştirme' }).check();
    await page.getByRole('button', { name: 'Devam et' }).click();
    await page.getByRole('checkbox', { name: 'Staj bulmak' }).check();
    await page.getByRole('button', { name: 'Devam et' }).click();
    await page.getByRole('button', { name: 'Tercihlerimi gözden geçirdim' }).click();
    await page.getByRole('button', { name: 'Başlangıcı tamamla' }).click();
    await expect(page.getByRole('heading', { name: 'Hazırsın!' })).toBeVisible();
    await page.getByRole('link', { name: 'Ana sayfaya git' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator('a[href="/hesap"]').last().click();
    await page.getByRole('link', { name: /^Profilim/ }).click();
    await expect(page).toHaveURL(/\/profil$/);
    await page.getByRole('button', { name: 'Profilimi düzenle' }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Başlık').fill('Öğrenci');
    await editor.getByLabel('Şehir').fill('İstanbul');
    await editor.getByRole('button', { name: 'Kaydet' }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByText('Profilin güncellendi.')).toBeVisible();
    await page.locator('a[href="/deneyimler"]').last().click();
    await expect(page).toHaveURL(/\/deneyimler/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGTERM');
    await Promise.race([stopped, new Promise<void>((resolve) => setTimeout(resolve, 8_000))]);
    if (worker.exitCode === null && worker.signalCode === null) {
      worker.kill('SIGKILL');
      await stopped;
    }
  }
});
