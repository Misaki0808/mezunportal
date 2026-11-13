import { loginAs } from './login';
import { expect, test } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
const login = loginAs;

test('yönetici gerekçeyle askıya alır; oturum kapanır ve yeniden giriş engellenir', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const target = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const targetContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const targetPage = await targetContext.newPage();
  try {
    await login(targetPage, 'alumniMentor');
    await login(page, 'systemAdmin');
    await page.goto('/yonetim/kullanicilar');
    await page.getByLabel('Ad veya e-posta ile ara').fill('alumni-mentor@test.mezunportal.local');
    await page.getByRole('button', { name: 'Ara', exact: true }).click();
    const card = page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: target.name, exact: true }) });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText(target.email);
    await card.getByRole('link', { name: 'Ayrıntıyı aç' }).click();
    await page.getByRole('button', { name: 'Hesabı askıya al' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Onayla' }).click();
    await expect(dialog.getByText('En az 3 karakterlik bir gerekçe yaz.')).toBeVisible();
    await dialog.getByLabel('İşlem gerekçesi').fill('Hesap güvenliği incelemesi');
    await dialog.getByRole('button', { name: 'Onayla' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Hesap askıya alındı.' }),
    ).toBeVisible();
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).banned).toBe(true);
    await targetPage.goto('/hesap');
    await expect(targetPage).toHaveURL(/\/giris/);
    await loginAs(targetPage, 'alumniMentor', { expectRejected: true });
    await expect(targetPage).toHaveURL(/\/giris$/);
  } finally {
    await db.user.update({
      where: { id: target.id },
      data: { banned: target.banned, banReason: target.banReason, banExpires: target.banExpires },
    });
    await targetContext.close();
  }
});

test('bölüm yöneticisinin panelinde sistem bölümleri yok ve doğrudan erişim reddedilir', async ({
  page,
}) => {
  await login(page, 'departmentAdmin');
  await page.goto('/yonetim');
  await expect(page.getByRole('link', { name: /Kullanıcılar/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sözlükler/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /İşlem kaydı/ })).toHaveCount(0);
  for (const path of [
    '/yonetim/sozlukler',
    '/yonetim/eslesmeyenler',
    '/yonetim/yetkiler',
    '/yonetim/islem-kaydi',
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Bu işlem için yetkin yok.')).toBeVisible();
  }
});

test('sistem yöneticisi toplu istihdam raporunu Excel olarak indirebilir', async ({ page }) => {
  await login(page, 'systemAdmin');
  await page.goto('/yonetim/istihdam');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Excel indir' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('mezun-istihdam-raporu.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    'Özet',
    'Sektör',
    'Unvan',
    'Şirket',
  ]);
});

test('fakülte yöneticisi kapsamlı paneli görür, sistem sözlüğüne erişemez', async ({ page }) => {
  const academic = await db.user.findUniqueOrThrow({
    where: { email: 'academic@test.mezunportal.local' },
  });
  const system = await db.user.findUniqueOrThrow({
    where: { email: 'system-admin@test.mezunportal.local' },
  });
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: academic.id, endedAt: null, verificationStatus: 'VERIFIED' },
    include: { department: true },
  });
  const grant = await db.adminGrant.create({
    data: {
      userId: academic.id,
      scope: 'FACULTY',
      facultyId: membership.department.facultyId,
      grantedById: system.id,
    },
  });
  try {
    await login(page, 'academic');
    await page.goto('/yonetim');
    await expect(page.getByRole('link', { name: /Kullanıcılar/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /İstihdam raporu/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sözlükler/ })).toHaveCount(0);
    for (const path of [
      '/yonetim/sozlukler',
      '/yonetim/eslesmeyenler',
      '/yonetim/yetkiler',
      '/yonetim/islem-kaydi',
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByText('Bu işlem için yetkin yok.')).toBeVisible();
    }
  } finally {
    await db.adminGrant.delete({ where: { id: grant.id } });
  }
});

test('sözlük kaydı eklenir, düzenlenir ve gerekçeyle silinir', async ({ page }) => {
  const suffix = Date.now().toString();
  const initial = `Deneme Sektör ${suffix}`;
  const changed = `Örnek Sektör ${suffix}`;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'systemAdmin');
    await page.goto('/yonetim/sozlukler');
    await page.getByLabel('Sözlük').selectOption('SECTOR');
    await page.getByRole('button', { name: 'Ekle', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Ad \(zorunlu\)$/ }).fill(initial);
    await dialog.getByRole('button', { name: 'Kaydet' }).click();
    let card = page.locator('li').filter({ hasText: initial });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Düzenle' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Ad \(zorunlu\)$/ }).fill(changed);
    await dialog.getByRole('button', { name: 'Kaydet' }).click();
    card = page.locator('li').filter({ hasText: changed });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Sil', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Sil', exact: true }).click();
    await expect(dialog.getByText('En az 3 karakterlik bir gerekçe yaz.')).toBeVisible();
    await dialog.getByLabel('İşlem gerekçesi').fill('Tekrarlanan deneme kaydı');
    await dialog.getByRole('button', { name: 'Sil', exact: true }).click();
    await expect(card).toHaveCount(0);
  } finally {
    await db.sector.deleteMany({ where: { name: { in: [initial, changed] } } });
  }
});

test('uzun sözlük/eşleşmeyen adları ve kullanıcı adı 360/390/1440 görünümünde taşmaz', async ({
  page,
}) => {
  test.setTimeout(60000);
  const suffix = Date.now().toString().slice(-8),
    companyName = 'W'.repeat(192) + suffix,
    raw = 'X'.repeat(192) + suffix;
  const company = await db.company.create({
    data: { name: companyName, normalizedName: companyName.toLowerCase(), aliases: [] },
  });
  const unmatched = await db.unmatchedValue.create({
    data: { kind: 'COMPANY', rawValue: raw, normalizedValue: raw.toLowerCase(), count: 1 },
  });
  const user = await db.user.create({
    data: {
      name: 'W'.repeat(100),
      email: `r2-boundary-${suffix}@example.invalid`,
      emailVerified: true,
    },
  });
  try {
    await login(page, 'systemAdmin');
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      for (const path of [
        '/yonetim/sozlukler',
        '/yonetim/eslesmeyenler',
        '/yonetim/kullanicilar',
      ]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const boundaryText = path.endsWith('sozlukler')
          ? companyName
          : path.endsWith('eslesmeyenler')
            ? raw
            : user.name;
        await expect(page.getByText(boundaryText).filter({ visible: true }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
    }
  } finally {
    await db.unmatchedValue.delete({ where: { id: unmatched.id } });
    await db.company.delete({ where: { id: company.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
