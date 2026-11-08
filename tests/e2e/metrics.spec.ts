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
  const pilot = await db.department.findFirstOrThrow({ where: { code: 'YBS' } });
  // Aynı yerel veritabanındaki eski profil olayları küçük grubu büyütmesin.
  const department = await db.department.create({
    data: {
      facultyId: pilot.facultyId,
      name: 'Sentetik metrik grubu',
      code: `metrics-${randomUUID()}`,
    },
  });
  const users = await Promise.all(
    Array.from({ length: 6 }, () =>
      db.user.create({
        data: { name: 'Sentetik Deneme', email: `${randomUUID()}@example.invalid` },
      }),
    ),
  );
  const ids = users.map((user) => user.id);
  try {
    await db.event.createMany({
      data: ids.slice(0, 5).map((userId, i) => ({
        userId,
        departmentId: department.id,
        role: i < 2 ? 'STUDENT' : 'ALUMNI',
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
    await page.getByLabel('Bölüm', { exact: true }).selectOption(department.id);
    await page.getByLabel('Olay türü').selectOption('PROFILE_THRESHOLD');
    await page.getByRole('button', { name: 'Raporu göster' }).click();
    const totals = page.getByRole('heading', { name: 'Olay türleri' }).locator('..');
    await expect(totals.locator('li')).toHaveCount(1);
    await expect(totals.getByText('Gizli (3’ten az kişi)')).toBeVisible();
    await expect(totals.getByText('2', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    const active = page.getByText('Etkin kullanıcı', { exact: true }).locator('..');
    await expect(active.getByText('Gizli (3’ten az kişi)', { exact: true })).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel indir' }).click();
    const file = await (await downloaded).path();
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file!);
    const typeSheet = book.getWorksheet('Olay türü')!;
    expect(typeSheet.getCell('A2').value).toBe('Profil eşiği');
    expect(typeSheet.getCell('B2').value).toBe('Gizli');
    let activeValue: unknown;
    book.getWorksheet('Özet')!.eachRow((row) => {
      if (row.getCell(1).value === 'Etkin kullanıcı sayısı') activeValue = row.getCell(2).value;
    });
    expect(activeValue).toBe('Gizli');
    await db.event.create({
      data: {
        userId: ids[5]!,
        departmentId: department.id,
        role: 'STUDENT',
        type: 'PROFILE_THRESHOLD',
        props: { threshold: 50 },
      },
    });
    await page.getByRole('button', { name: 'Raporu göster' }).click();
    await expect(totals.getByText('6', { exact: true })).toBeVisible();
    await expect(active.getByText('6', { exact: true })).toBeVisible();
  } finally {
    await db.event.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.department.delete({ where: { id: department.id } });
  }
});

test('inceleyici: rızasız ve yetkisiz kullanıcı metrik sayfasında 404, Excel rotasında 403 alır', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const admin = await db.user.findUniqueOrThrow({
    where: { email: 'system-admin@test.mezunportal.local' },
  });
  const { CURRENT_CONSENT_VERSIONS } = await import('../../src/contracts/privacy');
  await page.goto('/giris/test?persona=systemAdmin');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  const now = new Date(),
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    to = new Date(from.getTime() + 86400000),
    query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  try {
    await db.consent.create({
      data: {
        userId: admin.id,
        documentType: 'TERMS_OF_USE',
        version: CURRENT_CONSENT_VERSIONS.TERMS_OF_USE,
        granted: false,
      },
    });
    expect((await context.request.get('/yonetim/kullanim', { maxRedirects: 0 })).status()).toBe(
      404,
    );
    expect(
      (
        await context.request.get('/api/yonetim/rapor/kullanim?' + query, { maxRedirects: 0 })
      ).status(),
    ).toBe(403);
  } finally {
    await db.consent.create({
      data: {
        userId: admin.id,
        documentType: 'TERMS_OF_USE',
        version: CURRENT_CONSENT_VERSIONS.TERMS_OF_USE,
        granted: true,
      },
    });
  }
  await page.goto('/giris/test?persona=student');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  expect((await context.request.get('/yonetim/kullanim', { maxRedirects: 0 })).status()).toBe(404);
  expect(
    (
      await context.request.get('/api/yonetim/rapor/kullanim?' + query, { maxRedirects: 0 })
    ).status(),
  ).toBe(403);
});
