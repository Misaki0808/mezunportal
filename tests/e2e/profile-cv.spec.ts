import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

async function login(page: Page, persona: 'student') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await page.waitForLoadState('networkidle');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}

// Çalışan iş kuyruğu (worker) bu testte yok: ayrıştırma sonucu, işin üreteceği biçimde (`PARSED` +
// doğrulanmış çıktı) veritabanına konur; ekran akışı (onay → uygulama → profil) gerçek servislerle denenir.
test('CV onayı: kalem kalem kabul → profile yazılır; elle ekleme ve düzeltme', async ({ page }) => {
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
  await linkDialog.getByLabel('Adres').fill('http://github.com/e2e');
  await linkDialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(linkDialog.getByText('Adres https ile başlamalı.')).toBeVisible();
});
