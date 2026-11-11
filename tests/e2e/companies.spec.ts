import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('şirketi takma adla bulur; anonim deneyim ve güvenli boş dönem görünür', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const marker = randomUUID().slice(0, 8);
  const name = `Örnek Kariyer Teknoloji ${marker}`;
  const alias = `arama${marker}`;
  const student = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.student.email },
  });
  const moderator = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.systemAdmin.email },
  });
  const member = await db.membership.findFirstOrThrow({
    where: { userId: student.id, role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: null },
  });
  const company = await db.company.create({
    data: { name, normalizedName: name.toLowerCase(), aliases: [alias] },
    select: { id: true },
  });
  try {
    await db.experience.create({
      data: {
        authorId: student.id,
        departmentIdAtWrite: member.departmentId,
        companyId: company.id,
        organizationName: name,
        type: 'INTERNSHIP',
        durationWeeks: 8,
        pay: 'PAID',
        applicationChannel: 'REFERRAL',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        moderatedById: moderator.id,
        moderatedAt: new Date(),
        isAnonymous: true,
        termYear: 2025,
        termSeason: 'SUMMER',
        whatLearned: 'Takım çalışmasını öğrendim.',
        advice: 'Sorular sormaktan çekinme.',
      },
      select: { id: true },
    });
    await loginAs(page, 'student');
    await page.goto('/sirketler');
    await page.getByLabel('Şirket adı veya takma adı').fill(alias);
    await page.getByRole('button', { name: 'Ara', exact: true }).click();
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('tab', { name: 'Deneyimler' })).toBeInViewport();
    await expect(page.getByText('Anonim', { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(student.id);
    await page.getByRole('tab', { name: 'Başvuru dönemi' }).click();
    await expect(page.getByText('Henüz yeterli veri yok')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto(`/sirketler/${company.id}`);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('tab', { name: 'Deneyimler' })).toBeInViewport();
  } finally {
    await db.experience.deleteMany({ where: { companyId: company.id } });
    await db.company.deleteMany({ where: { id: company.id } });
  }
});
