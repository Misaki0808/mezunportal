import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('mobil filtreli aramanın paylaşılan bağlantısı aynı sonucu açar', async ({
  page,
  browser,
}) => {
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const author = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: student.id, verificationStatus: 'VERIFIED', endedAt: null },
  });
  const row = await db.experience.create({
    data: {
      authorId: author.id,
      departmentIdAtWrite: membership.departmentId,
      type: 'INTERNSHIP',
      organizationName: 'KutupTeknoloji',
      termYear: 2025,
      termSeason: 'SUMMER',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'COMPANY_SITE',
      advice: 'Erken başvur.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      moderatedAt: new Date(),
      moderatedById: student.id,
      isAnonymous: true,
      whatLearned: 'Örnek staj deneyimi',
    },
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/giris/test?persona=academic');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/(hesap|onay)$/);
    await page.goto('/onay');
    const consent = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await consent.nth(0).check();
    await consent.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
    await page.goto('/deneyimler');
    await page.getByLabel('Deneyim ara').fill('KutupTeknoloji');
    await page.getByRole('button', { name: 'Ara', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'KutupTeknoloji' })).toBeVisible();
    await page.getByRole('button', { name: /Filtreler/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Deneyim türü').selectOption('INTERNSHIP');
    await dialog.getByRole('button', { name: 'Filtreleri uygula' }).click();
    await expect(page).toHaveURL(/types=INTERNSHIP/);
    await expect(page.getByRole('heading', { name: 'KutupTeknoloji' })).toBeVisible();
    const shared = page.url();
    const context = await browser.newContext({
      storageState: await page.context().storageState(),
      viewport: { width: 390, height: 844 },
    });
    const recipient = await context.newPage();
    await recipient.goto(shared);
    await expect(recipient.getByRole('heading', { name: 'KutupTeknoloji' })).toBeVisible();
    await expect(
      recipient
        .locator('li')
        .filter({ has: recipient.getByRole('heading', { name: 'KutupTeknoloji' }) })
        .getByText('Anonim paylaşıldı'),
    ).toBeVisible();
    expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await context.close();
  } finally {
    await db.experience.delete({ where: { id: row.id } });
  }
});
