import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import ExcelJS from 'exceljs';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test('yönetici küçük grubu gizli görür ve aynı korumayla Excel indirir', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const department = await db.department.findFirstOrThrow({ where: { code: 'YBS' } });
  const users = await Promise.all(
    Array.from({ length: 2 }, () =>
      db.user.create({
        data: { name: 'Sentetik Deneme', email: `${randomUUID()}@example.invalid` },
      }),
    ),
  );
  const ids = users.map((user) => user.id);
  try {
    await db.event.createMany({
      data: ids.map((userId) => ({
        userId,
        departmentId: department.id,
        role: 'STUDENT',
        type: 'PROFILE_THRESHOLD',
        props: { threshold: 50 },
      })),
    });
    await page.goto('/giris/test?persona=systemAdmin');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/(hesap|onay)$/);
    await page.goto('/onay');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true })
      .nth(0)
      .check();
    await page
      .getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true })
      .nth(1)
      .check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
    await page.goto('/yonetim/kullanim');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Olay türü').selectOption('PROFILE_THRESHOLD');
    await page.getByRole('button', { name: 'Raporu göster' }).click();
    const totals = page.getByRole('heading', { name: 'Olay türleri' }).locator('..');
    await expect(totals.locator('li')).toHaveCount(1);
    await expect(totals.getByText('Gizli (3’ten az kişi)')).toBeVisible();
    await expect(totals.getByText('2', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel indir' }).click();
    const file = await (await downloaded).path();
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file!);
    const typeSheet = book.getWorksheet('Olay türü')!;
    expect(typeSheet.getCell('A2').value).toBe('Profil eşiği');
    expect(typeSheet.getCell('B2').value).toBe('Gizli');
  } finally {
    await db.event.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
});
