import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { startEmailWorker, stopEmailWorker } from './email-worker';
import { expect, test, type Page } from './fixture';
import { waitForHydratedForm } from './hydration';

async function emailLink(page: Page, email: string, path: string) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch(
            `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          )
        ).json();
        for (const message of list.messages ?? []) {
          if (
            !message.To.some((entry: { Address: string }) => entry.Address.toLowerCase() === email)
          )
            continue;
          const detail = await (
            await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)
          ).json();
          link = (detail.Text as string)
            .match(/https?:\/\/[^\s<>]+/g)
            ?.find((url) => new URL(url).pathname.endsWith(path));
          if (link) break;
        }
        return Boolean(link);
      },
      { timeout: 30_000, message: 'Yerel test e-postası alınamadı.' },
    )
    .toBe(true);
  if (!link) throw new Error('Yerel test bağlantısı yok.');
  const url = new URL(link);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== new URL(page.url()).port)
    throw new Error('Bağlantı bu test sunucusuna ait değil.');
  return link;
}

test('yeni hesap iki adımlı e-posta değiştirir, oturumunu yeniler, çıkar ve yeni adresiyle aynı hesaba girer', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const worker = startEmailWorker();
  const email = `auth-change-${randomUUID()}@ogr.iu.edu.tr`;
  const nextEmail = `auth-changed-${randomUUID()}@ogr.iu.edu.tr`;
  async function signIn(address: string) {
    await page.goto('/giris');
    await waitForHydratedForm(page, 'Giriş bağlantısı gönder');
    await page.getByLabel('E-posta adresi').fill(address);
    await page.getByRole('button', { name: 'Giriş bağlantısı gönder' }).click();
    await expect(page).toHaveURL(/\/giris\/epostani-kontrol-et$/);
    const link = await emailLink(page, address, '/magic-link/verify');
    const verified = await context.request.get(link, { maxRedirects: 0 }).catch(() => null);
    expect(verified?.status()).toBe(302);
    await page.goto('/hesap', { waitUntil: 'networkidle' });
  }
  try {
    await signIn(email);
    await expect(page).toHaveURL(/\/onay(?:\?.*)?$/);
    await waitForHydratedForm(page, 'Seçimlerimi kaydet');
    const consents = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await consents.nth(0).check();
    await consents.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page).toHaveURL(/\/hesap$/);
    const owner = await db.user.findUniqueOrThrow({ where: { email } });
    await page.goto('/hesap/e-posta', { waitUntil: 'networkidle' });
    await page.getByLabel('Yeni e-posta adresi').fill(nextEmail);
    await page.getByRole('button', { name: 'Doğrulama bağlantısı gönder' }).click();
    await expect(page.getByRole('heading', { name: 'E-postanı kontrol et' })).toBeVisible();
    const confirmation = await emailLink(page, email, '/verify-email');
    const confirmed = await context.request
      .get(confirmation, { maxRedirects: 0 })
      .catch(() => null);
    expect(confirmed?.status()).toBe(302);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(email);
    const verification = await emailLink(page, nextEmail, '/verify-email');
    const verified = await context.request.get(verification, { maxRedirects: 0 }).catch(() => null);
    expect(verified?.status()).toBe(302);
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      email: nextEmail,
      emailVerified: true,
      deletedAt: null,
    });
    const now = Date.now(),
      day = 24 * 3600 * 1000;
    await db.session.updateMany({
      where: { userId: owner.id },
      data: { updatedAt: new Date(now - 2 * day), expiresAt: new Date(now + 10 * day) },
    });
    await page.goto('/hesap', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Hesabın', exact: true })).toBeVisible();
    const refreshed = await db.session.findFirstOrThrow({
      where: { userId: owner.id },
      orderBy: { expiresAt: 'desc' },
    });
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(now + 13 * day);
    await page.goto('/cikis', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Çıkış yap', exact: true }).click();
    await expect(page).toHaveURL(/\/giris$/);
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    await signIn(nextEmail);
    await expect(page).toHaveURL(/\/hesap$/);
    expect((await db.user.findUniqueOrThrow({ where: { email: nextEmail } })).id).toBe(owner.id);
  } finally {
    await stopEmailWorker(worker);
    await db.$disconnect();
  }
});
