import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';
import { PrismaClient } from '../../src/generated/prisma/client';
import { waitForHydratedForm } from './hydration';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, persona: 'systemAdmin' | 'alumniMentor' | 'departmentAdmin') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await waitForHydratedForm(page, 'Seçimlerimi kaydet');
  const boxes = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}

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
    await targetPage.goto('/giris/test?persona=alumniMentor');
    await targetPage.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
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
  await page.goto('/yonetim/sozlukler');
  await expect(page.getByText('Bu işlem için yetkin yok.')).toBeVisible();
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
