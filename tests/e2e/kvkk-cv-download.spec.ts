import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('kendi CV dosyasını indirir, askıda hak başvurusu bağlantısı gösterilir', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const owner = await db.user.findUniqueOrThrow({ where: { email: TEST_PERSONAS.student.email } });
  const other = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  const key = `cv/${owner.id}/${randomUUID()}.pdf`;
  const file = path.resolve(process.env.STORAGE_LOCAL_PATH ?? '.data/files', key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '%PDF-1.4\nsynthetic cv\n%%EOF');
  const upload = await db.cvUpload.create({
    data: { userId: owner.id, storageKey: key, byteSize: 30, pageCount: 1 },
  });
  const foreign = await db.cvUpload.create({
    data: {
      userId: other.id,
      storageKey: `cv/${other.id}/${randomUUID()}.pdf`,
      byteSize: 1,
      pageCount: 1,
    },
  });
  try {
    await loginAs(page, 'student');
    await page.goto('/hesap/veriler');
    await expect(page.getByRole('heading', { name: 'Yüklediğin CV dosyaları' })).toBeVisible();
    if (process.env.KVKK_EVIDENCE) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({
          path: `${process.env.KVKK_EVIDENCE}/veriler-${width}.png`,
          fullPage: true,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
    const downloaded = page.waitForEvent('download');
    await page.getByRole('link', { name: 'CV dosyasını indir (1)' }).click();
    expect((await downloaded).suggestedFilename()).toBe('cv.pdf');
    const own = await page.request.get(`/api/hesabim/cv/${upload.id}`);
    expect(own.status()).toBe(200);
    expect(own.headers()['cache-control']).toBe('no-store');
    const foreignResponse = await page.request.get(`/api/hesabim/cv/${foreign.id}`);
    const absent = await page.request.get('/api/hesabim/cv/not-real');
    expect(foreignResponse.status()).toBe(404);
    expect(await foreignResponse.json()).toEqual(await absent.json());
    const anonymous = await browser.newContext();
    try {
      expect((await anonymous.request.get(`/api/hesabim/cv/${upload.id}`)).status()).toBe(401);
    } finally {
      await anonymous.close();
    }
    await db.user.update({ where: { id: owner.id }, data: { banned: true } });
    for (const url of ['/hesap/veriler', '/hesap/hesabi-sil']) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url);
      await expect(page.getByText(/Hesabın askıdayken bu işlem buradan yapılamaz/)).toBeVisible();
      const card = await page
        .getByRole('heading', { name: 'KVKK başvurun' })
        .locator('..')
        .boundingBox();
      const header = await page.locator('header').first().boundingBox();
      expect(card).not.toBeNull();
      expect(header).not.toBeNull();
      expect(card!.x).toBeGreaterThanOrEqual(16);
      expect(card!.x + card!.width).toBeLessThanOrEqual(390 - 16);
      expect(card!.y).toBeGreaterThanOrEqual(header!.y + header!.height + 16);
      if (process.env.KVKK_EVIDENCE && url === '/hesap/veriler') {
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({
            path: `${process.env.KVKK_EVIDENCE}/aski-${width}.png`,
            fullPage: true,
          });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
      }
      await expect(page.getByRole('link', { name: 'Aydınlatma metnini oku' })).toHaveAttribute(
        'href',
        '/hukuki/aydinlatma',
      );
      await expect(page.getByRole('button', { name: /Verilerimi indir|Hesabımı sil/ })).toHaveCount(
        0,
      );
    }
    expect((await page.request.get('/api/hesabim/veri-dokumu')).status()).toBe(403);
    expect((await page.request.get(`/api/hesabim/cv/${upload.id}`)).status()).toBe(403);
  } finally {
    await db.user.update({ where: { id: owner.id }, data: { banned: false } });
    await db.cvUpload.deleteMany({ where: { id: { in: [upload.id, foreign.id] } } });
    await rm(file, { force: true });
  }
});
