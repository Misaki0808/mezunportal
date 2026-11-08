import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

test('öğrenci e-posta bağlantısıyla girer ve üyeliğini doğrular', async ({ page, context }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(8_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
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
  try {
    const email = `e2e-${randomUUID()}@ogr.iu.edu.tr`;
    const started = Date.now();
    await page.goto('/hesap/gizlilik');
    await expect(page).toHaveURL(/\/giris\?donus=/);
    await expect(page.getByRole('heading', { name: 'Devam etmek için giriş yap' })).toBeVisible();
    await page.getByLabel('E-posta adresi').fill(email);
    await page.getByRole('button', { name: 'Giriş bağlantısı gönder' }).click();
    await expect(page).toHaveURL(/\/giris\/epostani-kontrol-et$/);
    let link: string | undefined;
    await expect
      .poll(
        async () => {
          try {
            const response = await fetch('http://127.0.0.1:8025/api/v1/messages?limit=100');
            const list = await response.json();
            const message = list.messages.find(
              (item: { To: { Address: string }[]; Created: string }) =>
                item.To.some((recipient) => recipient.Address.toLowerCase() === email) &&
                Date.parse(item.Created) >= started - 5000,
            );
            if (message) {
              const detail = await (
                await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)
              ).json();
              link = (detail.Text as string)
                .match(/https?:\/\/[^\s<>]+/g)
                ?.find((url) => url.includes('/magic-link/verify'));
            }
          } catch {
            /* Mailpit ve worker hazır olana kadar bekle. */
          }
          return Boolean(link);
        },
        { timeout: 30_000, message: 'Yerel Mailpit üzerinde giriş e-postası alınamadı.' },
      )
      .toBe(true);
    if (!link) throw new Error('Giriş bağlantısı bulunamadı.');
    const url = new URL(link);
    const expectedPort = new URL(page.url()).port;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== expectedPort) {
      throw new Error('Giriş bağlantısı bu worktree sunucusuna ait değil.');
    }
    // Jeton içeren adresi tarayıcı geçmişine veya test çıktısına yazmadan oturum çerezini al.
    const verification = await context.request.get(link, { maxRedirects: 0 }).catch(() => null);
    expect(verification?.status()).toBeGreaterThanOrEqual(300);
    expect(verification?.status()).toBeLessThan(400);
    expect(decodeURIComponent(verification?.headers().location ?? '')).toContain('/hesap/gizlilik');
    await page.goto('/hesap/gizlilik');
    await expect(page).toHaveURL(/\/onay(?:\?.*)?$/);
    const consents = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await consents.nth(0).check();
    await consents.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page).toHaveURL(/\/hesap\/gizlilik$/);
    await page.goto('/');
    await expect(page.getByText('Doğrulamanı tamamla')).toBeVisible();
    await page.getByRole('link', { name: 'Doğrulamaya git' }).click();
    await expect(page).toHaveURL(/\/dogrulama$/);
    await page.getByRole('link', { name: 'Üyeliğini doğrula' }).click();
    await expect(page).toHaveURL(/\/dogrulama\/uyelik$/);
    await page.getByLabel('Bölüm').selectOption({ index: 1 });
    await page.getByLabel('Üniversiteye giriş yılı').fill('2024');
    await page.getByRole('button', { name: 'Doğrulamayı tamamla' }).click();
    await expect(page.getByText('Üyeliğin doğrulandı.')).toBeVisible();
    await page.getByRole('link', { name: 'Durumu gör' }).click();
    await expect(page.getByRole('heading', { name: 'Üyeliğin doğrulandı' })).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { name: /Profilini tamamla/ }).click();
    await expect(page).toHaveURL(/\/baslangic$/);
    await page.getByRole('checkbox', { name: 'Yazılım geliştirme' }).check();
    await page.getByRole('button', { name: 'Devam et' }).click();
    await expect(page.getByRole('heading', { name: 'Birlikte neyi hedefleyelim?' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Birlikte neyi hedefleyelim?' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Staj bulmak' }).check();
    await page.getByRole('button', { name: 'Geri' }).click();
    await expect(page.getByRole('checkbox', { name: 'Yazılım geliştirme' })).toBeChecked();
    await page.getByRole('button', { name: 'Devam et' }).click();
    await expect(page.getByRole('checkbox', { name: 'Staj bulmak' })).toBeChecked();
    await page.getByRole('button', { name: 'Devam et' }).click();
    await expect(
      page.getByRole('heading', { name: 'Gizlilik tercihlerini gözden geçir' }),
    ).toBeVisible();
    await page.getByLabel('LinkedIn').selectOption('PRIVATE');
    await page.getByRole('button', { name: 'Tercihlerimi gözden geçirdim' }).click();
    await page.getByRole('button', { name: 'Başlangıcı tamamla' }).click();
    await expect(page.getByRole('heading', { name: 'Hazırsın!' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { profile: { include: { tags: { include: { tag: true } } } } },
    });
    expect(user.profile?.onboardingStep).toBe('COMPLETE');
    expect(user.profile?.tags.map(({ tag }) => tag.kind).sort()).toEqual(['GOAL', 'INTEREST']);
    expect(
      await db.fieldVisibility.findUnique({
        where: { userId_field: { userId: user.id, field: 'LINKEDIN' } },
      }),
    ).toMatchObject({ level: 'PRIVATE' });
    await page.goto('/hesap');
    await page.getByRole('link', { name: /Profilim \/ Başlangıç adımları/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Yazılım geliştirme' })).toBeChecked();
    await page.getByRole('button', { name: 'Şimdilik atla' }).click();
    await expect(page.getByRole('heading', { name: 'Birlikte neyi hedefleyelim?' })).toBeVisible();
    await page.goto('/hesap');
    await page.getByRole('link', { name: /Profilim \/ Başlangıç adımları/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Yazılım geliştirme' })).toBeChecked();
  } finally {
    worker.kill('SIGTERM');
    await db.$disconnect();
  }
});
