import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { loginAs } from './login';
import { expect, test } from './fixture';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });
for (const width of [390, 1440])
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`fotoğraf yükle, kırp, göster ve geri al (${width}, ${colorScheme})`, async ({
      page,
      browser,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme });
      const unexpected: string[] = [];
      page.on('pageerror', (error) => unexpected.push(error.name));
      await loginAs(page, 'student');
      await page.goto('/profil/fotograf');
      await page.waitForLoadState('networkidle');
      const input = await sharp({
        create: { width: 240, height: 360, channels: 3, background: '#627fbc' },
      })
        .composite([
          {
            input: Buffer.from(
              '<svg width="240" height="360"><circle cx="120" cy="120" r="45" fill="#f0d7aa"/><ellipse cx="120" cy="260" rx="85" ry="100" fill="#283d67"/></svg>',
            ),
          },
        ])
        .png()
        .toBuffer();
      const choosing = page.waitForEvent('filechooser');
      await expect(
        page
          .locator('form')
          .filter({ has: page.getByRole('button', { name: 'Fotoğraf seç', exact: true }) }),
      ).toHaveAttribute('data-hydrated', 'true');
      await page.getByRole('button', { name: 'Fotoğraf seç', exact: true }).click();
      await (
        await choosing
      ).setFiles({ name: 'sentetik-portre.png', mimeType: 'image/png', buffer: input });
      await expect(page.getByRole('img', { name: 'Kare fotoğraf önizlemesi' })).toBeVisible();
      const save = page.getByRole('button', { name: 'Fotoğrafı kaydet', exact: true });
      await expect(save).toBeDisabled();
      await page.getByLabel('Yakınlaştırma', { exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await page
        .getByRole('checkbox', {
          name: 'Fotoğrafım platformdaki doğrulanmış üyelere görünsün',
          exact: true,
        })
        .check();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: info.outputPath(`crop-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      const sent = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/profil-fotografi') &&
          response.request().method() === 'POST',
      );
      await save.click();
      expect((await sent).status()).toBe(200);
      await expect(
        page.getByRole('status').filter({ hasText: 'Fotoğrafın kaydedildi.' }),
      ).toBeVisible();
      const photo = page.locator('img[src*="/api/profil-fotografi/"]').first();
      await expect(photo).toBeVisible();
      await expect
        .poll(() => photo.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      const source = await photo.getAttribute('src');
      expect(source).not.toBeNull();
      const response = await page.request.get(source!);
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toBe('private, no-store');
      const metadata = await sharp(await response.body()).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.format).toBe('webp');
      const anonymous = await browser.newContext();
      try {
        expect((await anonymous.request.get(new URL(source!, page.url()).href)).status()).toBe(404);
      } finally {
        await anonymous.close();
      }
      await page.goto('/profil');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1 img')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: info.outputPath(`profile-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      await page.goto('/profil/fotograf');
      await page
        .getByRole('button', { name: 'Rızamı geri al ve fotoğrafımı sil', exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Fotoğrafın silindi; artık gösterilmiyor.' }),
      ).toBeVisible();
      expect((await page.request.get(source!)).status()).toBe(404);
      await expect(page.locator('img[src*="/api/profil-fotografi/"]')).toHaveCount(0);
      expect(unexpected).toEqual([]);
    });
  }
