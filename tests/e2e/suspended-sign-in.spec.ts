import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { startEmailWorker, stopEmailWorker } from './email-worker';
import { expect, test, type Page } from './fixture';
import { waitForHydratedForm } from './hydration';

// Askıdaki kullanıcı yönetici askıya alınca oturumunu kaybeder ve /hesap/veriler, /hesap/hesabi-sil'e ulaşamaz (kart 547 not 4);
// KVKK yolunu görebileceği tek yer, giriş bağlantısına tıklayınca düştüğü engel ekranıdır (kart 548). Bağlantı isteme formu askıyı
// belli ETMEZ (kayıtlı/kayıtsız/askıda/silinmiş aynı yanıt, R1 531): bilgi yalnız e-postanın sahibine, bağlantıya tıklayınca görünür.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

async function requestLink(page: Page, address: string) {
  await page.goto('/giris');
  await waitForHydratedForm(page, 'Giriş bağlantısı gönder');
  await page.getByLabel('E-posta adresi').fill(address);
  await page.getByRole('button', { name: 'Giriş bağlantısı gönder' }).click();
  await expect(page).toHaveURL(/\/giris\/epostani-kontrol-et$/);
  return (await page.getByRole('main').innerText()).split(address).join('<adres>');
}

/** Yerel Mailpit'ten bu adrese giden son giriş bağlantısı. */
async function signInLinkFor(address: string, since: number) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        try {
          const list = await (
            await fetch('http://127.0.0.1:8025/api/v1/messages?limit=100')
          ).json();
          const message = list.messages.find(
            (item: { To: { Address: string }[]; Created: string }) =>
              item.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()) &&
              Date.parse(item.Created) >= since - 5000,
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
          /* Mailpit ve işçi hazır olana kadar bekle. */
        }
        return Boolean(link);
      },
      { timeout: 30_000, message: 'Yerel Mailpit üzerinde giriş e-postası alınamadı.' },
    )
    .toBe(true);
  return link!;
}

for (const width of [390, 1440]) {
  test(`askıdaki kullanıcı giriş bağlantısına tıklayınca açıklamayı ve aydınlatma metni bağlantısını görür (${width}px)`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const target = await db.user.findUniqueOrThrow({
      where: { email: TEST_PERSONAS.seniorMentor.email },
    });
    const worker = startEmailWorker();
    try {
      await db.user.update({
        where: { id: target.id },
        data: { banned: true, banReason: 'Deneme', banExpires: null },
      });
      // 1) Bağlantı isteme formu askıyı belli etmez: askıdaki ve kayıtsız adres aynı ekranı alır.
      const unknown = `e2e-${randomUUID()}@ogr.iu.edu.tr`;
      const forSuspended = await requestLink(page, target.email);
      const forUnknown = await requestLink(page, unknown);
      expect(forSuspended).toBe(forUnknown);
      expect(forSuspended).not.toMatch(/askı|KVKK|aydınlatma/i);
      // 2) E-postanın sahibi bağlantıya tıklar: oturum açılmaz, giriş sayfası engeli ve KVKK yolunu gösterir.
      const since = Date.now();
      await requestLink(page, target.email);
      const link = await signInLinkFor(target.email, since);
      // Jetonlu adres tarayıcı geçmişine/test çıktısına yazılmadan çözülür.
      const verification = await context.request.get(link, { maxRedirects: 0 });
      expect(verification.status()).toBeGreaterThanOrEqual(300);
      expect(verification.status()).toBeLessThan(400);
      expect(verification.headers()['set-cookie'] ?? '').not.toMatch(/session/i);
      const location = verification.headers().location ?? '';
      expect(decodeURIComponent(location)).toContain('hata=AUTH_ACCOUNT_SUSPENDED');
      await page.goto(
        new URL(location, page.url()).pathname + new URL(location, page.url()).search,
      );
      const alert = page.getByRole('alert').filter({ hasText: 'Hesabın askıya alındı.' });
      await expect(alert).toBeVisible();
      test.info().annotations.push({
        type: 'ölçüm',
        description: `engel ekranı: "${(await page.getByRole('main').innerText()).replace(/\s+/g, ' ').slice(0, 260)}"`,
      });
      const kvkk = page.getByRole('link', { name: 'Aydınlatma metnini oku' });
      await expect(kvkk).toBeVisible();
      await expect(kvkk).toHaveAttribute('href', '/hukuki/aydinlatma');
      await expect(page.getByText(/KVKK kapsamındaki başvurular için/)).toBeVisible();
      // Dokunma hedefi ≥ 44 px, sayfa yana kaymaz.
      const box = await kvkk.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (process.env.SUSPENDED_EVIDENCE)
        await page.screenshot({
          path: `${process.env.SUSPENDED_EVIDENCE}/aski-giris-${width}.png`,
          fullPage: true,
        });
      // Bağlantı giriş yapmamış kullanıcıya açık aydınlatma metnine gider.
      await kvkk.click();
      await expect(page).toHaveURL(/\/hukuki\/aydinlatma$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } finally {
      await db.user.update({
        where: { id: target.id },
        data: { banned: target.banned, banReason: target.banReason, banExpires: target.banExpires },
      });
      await stopEmailWorker(worker);
    }
  });
}

test('başka giriş hataları KVKK bağlantısı göstermez', async ({ page }) => {
  await page.goto('/giris?hata=AUTH_LINK_INVALID');
  await expect(
    page.getByRole('alert').filter({ hasText: /geçersiz ya da süresi dolmuş/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Aydınlatma metnini oku' })).toHaveCount(0);
  await page.goto('/giris');
  await expect(page.getByRole('link', { name: 'Aydınlatma metnini oku' })).toHaveCount(0);
});
