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

test('mobilde özel ay kaydı, toplu takvim ve takip', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const [student, alumni, academic, moderator] = await Promise.all(
    [
      TEST_PERSONAS.student,
      TEST_PERSONAS.alumniMentor,
      TEST_PERSONAS.academic,
      TEST_PERSONAS.systemAdmin,
    ].map((persona) =>
      db.user.findUniqueOrThrow({ where: { email: persona.email }, select: { id: true } }),
    ),
  );
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: student!.id, endedAt: null, verificationStatus: 'VERIFIED' },
  });
  const name = `Takvim örneği ${randomUUID().slice(0, 8)}`;
  const company = await db.company.create({
    data: { name, normalizedName: name.toLowerCase(), aliases: [] },
    select: { id: true },
  });
  try {
    await db.experience.createMany({
      data: [student!, alumni!, academic!].map((user) => ({
        authorId: user.id,
        departmentIdAtWrite: membership.departmentId,
        companyId: company.id,
        organizationName: name,
        type: 'INTERNSHIP' as const,
        termYear: 2025,
        termSeason: 'SPRING' as const,
        appliedMonth: 3,
        durationWeeks: 8,
        pay: 'PAID' as const,
        applicationChannel: 'REFERRAL' as const,
        status: 'PUBLISHED' as const,
        moderatedAt: new Date(),
        moderatedById: moderator!.id,
        publishedAt: new Date(),
        whatLearned: 'Deneyim',
        advice: 'Başvur',
      })),
    });
    await loginAs(page, 'student');
    await page.goto('/deneyim/yeni');
    await page.getByLabel('Kurum ya da etkinlik adı').fill(name);
    await page.getByLabel('Başvuru ayı (isteğe bağlı)').selectOption('4');
    await page.getByRole('button', { name: 'Taslağı kaydet' }).click();
    await expect(page.getByText('Taslağın kaydedildi.')).toBeVisible();
    const draft = await db.experience.findFirstOrThrow({
      where: { authorId: student!.id, organizationName: name, status: 'DRAFT' },
      select: { id: true, appliedMonth: true },
    });
    expect(draft.appliedMonth).toBe(4);
    await page.goto(`/sirketler/${company.id}`);
    await page.getByRole('tab', { name: 'Başvuru dönemi' }).click();
    await expect(page.getByRole('button', { name: 'Takip et', exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toContainText('Mart');
    await page.getByRole('button', { name: 'Takip et', exact: true }).click();
    await expect(page.getByText('Takip ediliyor')).toBeVisible();
    expect(
      await db.companyFollow.count({ where: { userId: student!.id, companyId: company.id } }),
    ).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await db.experience.deleteMany({
      where: {
        OR: [
          { companyId: company.id },
          { authorId: student!.id, organizationName: name, status: 'DRAFT' },
        ],
      },
    });
    await db.company.deleteMany({ where: { id: company.id } });
  }
});
