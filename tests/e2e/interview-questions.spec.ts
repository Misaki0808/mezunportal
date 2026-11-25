import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test } from './fixture';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('eski mülakat adresi filtreleri koruyarak 308 ile yeni adrese gider', async ({ request }) => {
  for (const query of ['', '?q=veri+analizi&companyId=ornek&sectorId=sektor&page=2']) {
    const response = await request.get(`/mulakat-sorulari${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const destination = new URL(response.headers().location!, process.env.APP_URL);
    expect(destination.pathname).toBe('/mulakat-tuyolari');
    expect(destination.search).toBe(query);
  }
});

test('mobilde tüyo süz ve şirket sekmesinde anonim tüyoyu gör', async ({ page }) => {
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
    where: { userId: student!.id, verificationStatus: 'VERIFIED', endedAt: null },
  });
  const key = randomUUID().slice(0, 8);
  const company = await db.company.create({
    data: { name: `Soru Şirketi ${key}`, normalizedName: `soru ${key}`, aliases: [] },
    select: { id: true, name: true },
  });
  try {
    await db.experience.createMany({
      data: [student!, alumni!, academic!].map((user) => ({
        authorId: user.id,
        departmentIdAtWrite: membership.departmentId,
        companyId: company.id,
        organizationName: company.name,
        type: 'INTERNSHIP' as const,
        termYear: 2025,
        termSeason: 'SUMMER' as const,
        durationWeeks: 8,
        pay: 'PAID' as const,
        applicationChannel: 'REFERRAL' as const,
        status: 'PUBLISHED' as const,
        moderatedAt: new Date(),
        moderatedById: moderator!.id,
        publishedAt: new Date(),
        whatLearned: 'Öğrendim',
        advice: 'Çalışın',
        isAnonymous: true,
        interviewQuestions: ['SQL nedir?'],
      })),
    });
    await loginAs(page, 'student');
    await page.goto('/mulakat-tuyolari');
    await expect(page.getByRole('heading', { level: 1, name: 'Mülakat tüyoları' })).toBeVisible();
    await page.getByLabel('Şirket', { exact: true }).selectOption(company.id);
    await page.getByLabel('Tüyolarda ara').fill('SQL');
    await page.getByRole('button', { name: 'Tüyoları göster' }).click();
    await expect(page.getByText('SQL nedir?')).toBeVisible();
    await expect(page.getByText('3 deneyimde geçti')).toBeVisible();
    const response = await page.content();
    expect(response).not.toContain(student!.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto(`/sirketler/${company.id}`);
    await page.getByRole('tab', { name: 'Mülakat tüyoları' }).click();
    await expect(page.getByText('SQL nedir?')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await db.experience.deleteMany({ where: { companyId: company.id } });
    await db.company.deleteMany({ where: { id: company.id } });
  }
});
