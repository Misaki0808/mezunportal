import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { expect, test } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

const login = loginAs;

// Çalışan iş kuyruğu (worker) bu testte yok: ayrıştırma sonucu, işin üreteceği biçimde (`PARSED` +
// doğrulanmış çıktı) veritabanına konur; ekran akışı (onay → uygulama → profil) gerçek servislerle denenir.
test('CV onayı: kalem kalem kabul → profile yazılır; elle ekleme ve düzeltme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.cvUpload.deleteMany({ where: { userId: student.id } });
  await db.education.deleteMany({ where: { userId: student.id } });
  await db.position.deleteMany({ where: { userId: student.id } });
  await db.language.deleteMany({ where: { userId: student.id } });
  await db.certification.deleteMany({ where: { userId: student.id } });
  await db.cvUpload.create({
    data: {
      userId: student.id,
      storageKey: `cv/${student.id}/e2e-profile-cv.pdf`,
      byteSize: 100,
      pageCount: 1,
      status: 'PARSED',
      parsedJson: {
        profile: {
          headline: 'Yönetim Bilişim Sistemleri öğrencisi',
          summary: null,
          city: 'İstanbul',
        },
        education: [
          {
            institution: 'E2E Üniversitesi',
            level: 'BACHELOR',
            fieldOfStudy: 'Yönetim Bilişim Sistemleri',
            startDate: '2022-09',
            endDate: null,
            isCurrent: true,
          },
        ],
        positions: [],
        skills: ['TypeScript'],
        languages: [{ name: 'İngilizce', level: 'B2' }],
        certifications: [],
      },
    },
  });

  await login(page, 'student');
  await page.goto('/profil/cv');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Bulunan bilgileri gözden geçir' })).toBeVisible();
  // Karar verilmeyen kalem yazılmaz: önce yalnız eğitimi kabul et, dili reddet.
  const education = page
    .getByText('E2E Üniversitesi', { exact: true })
    .locator('xpath=ancestor::li[1]');
  await education.getByRole('button', { name: 'Kabul et' }).click();
  const language = page
    .getByText('İngilizce (B2)', { exact: true })
    .locator('xpath=ancestor::li[1]');
  await language.getByRole('button', { name: 'Reddet' }).click();
  await page.getByRole('button', { name: /Seçilenleri uygula/ }).click();
  await expect(page.getByRole('heading', { name: 'Profilin güncellendi' })).toBeVisible();
  expect(await db.education.count({ where: { userId: student.id } })).toBe(1);
  expect(await db.language.count({ where: { userId: student.id } })).toBe(0);

  await page.getByRole('link', { name: 'Profilime git' }).click();
  // Bilgi bölümleri varsayılan kapalıdır: içeriği görmek için bölüm açılır.
  await page.getByRole('button', { name: 'Eğitim', exact: true }).click();
  await expect(page.getByText('E2E Üniversitesi', { exact: true })).toBeVisible();
  await expect(page.getByText("CV'den", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Elle düzeltme kalemi “Düzeltildi” yapar; izinli olmayan bağlantı reddedilir.
  await page.waitForLoadState('networkidle');
  const block = page.getByRole('heading', { name: 'Eğitim' }).locator('xpath=ancestor::section[1]');
  await block.getByRole('button', { name: 'Düzenle' }).click();
  const dialog = page.getByRole('dialog');
  await page.setViewportSize({ width: 390, height: 500 });
  await dialog.getByLabel(/Bölüm \/ alan/).focus();
  const saveBox = await dialog.getByRole('button', { name: 'Kaydet', exact: true }).boundingBox();
  expect(saveBox).not.toBeNull();
  expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(500);
  const focusedBox = await dialog.getByLabel(/Bölüm \/ alan/).boundingBox();
  const cancelBox = await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).boundingBox();
  expect(focusedBox).not.toBeNull();
  expect(focusedBox!.y + focusedBox!.height).toBeLessThanOrEqual(
    Math.min(saveBox!.y, cancelBox!.y),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByLabel(/Bölüm \/ alan/).fill('Bilgisayar Mühendisliği');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Düzeltildi', { exact: true })).toBeVisible();
  const links = page
    .getByRole('heading', { name: 'Bağlantılar' })
    .locator('xpath=ancestor::section[1]');
  await links.getByRole('button', { name: 'Düzenle' }).click();
  const linkDialog = page.getByRole('dialog');
  await linkDialog.getByRole('button', { name: 'Bağlantı ekle' }).click();
  await linkDialog.getByLabel('Site').selectOption('GITHUB');
  await linkDialog.getByLabel('Adres', { exact: true }).fill('http://github.com/e2e');
  await linkDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(linkDialog.getByText('Adres https ile başlamalı.')).toBeVisible();
});

test('geçerli en uzun profil alanları ve beceri 360/390/1440 görünümünde taşmaz', async ({
  page,
}) => {
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'academic@test.mezunportal.local' },
  });
  const previous = await db.profile.findUnique({ where: { userId: user.id } });
  const profile = await db.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  const label = 'W'.repeat(72) + randomUUID().slice(0, 8);
  const tag = await db.tag.create({
    data: { kind: 'SKILL', slug: label.toLowerCase(), label, curated: false },
  });
  try {
    await db.profile.update({
      where: { id: profile.id },
      data: {
        headline: 'W'.repeat(120),
        city: 'W'.repeat(80),
        summary: 'W'.repeat(1500),
        goals: 'W'.repeat(500),
      },
    });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: tag.id } });
    await login(page, 'academic');
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      for (const path of ['/profil', `/uye/${user.id}`]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        if (path === '/profil') {
          // Uzun alanlar ancak açık bölümde görünür: taşma ölçümü açık haliyle yapılır.
          for (const name of ['Temel bilgiler', 'Beceriler']) {
            await page.getByRole('button', { name, exact: true }).click();
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (path === '/profil') {
          const remove = page.getByRole('button', { name: `${label} becerisini kaldır` });
          await remove.scrollIntoViewIfNeeded();
          const box = await remove.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
      }
    }
  } finally {
    await db.profileTag.deleteMany({ where: { profileId: profile.id, tagId: tag.id } });
    await db.tag.delete({ where: { id: tag.id } });
    if (previous)
      await db.profile.update({
        where: { id: profile.id },
        data: {
          headline: previous.headline,
          city: previous.city,
          summary: previous.summary,
          goals: previous.goals,
        },
      });
    else await db.profile.delete({ where: { id: profile.id } });
  }
});
