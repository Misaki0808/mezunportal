import { loginAs } from './login';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { grantRequiredConsents } from '../../src/test/fixtures';
import messages from '../../messages/tr.json' with { type: 'json' };
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const t = messages.courseGuide;
test.afterAll(() => db.$disconnect());
const login = loginAs;
test('360 px: mezun beş ders seçer, öğrenci YBS/ortak ayrımını ve seçmeli filtresini kullanır', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const alumni = await db.user.findUniqueOrThrow({
      where: { email: TEST_PERSONAS.alumniMentor.email },
    }),
    student = await db.user.findUniqueOrThrow({ where: { email: TEST_PERSONAS.student.email } });
  for (const u of [alumni, student]) await grantRequiredConsents(db, u.id);
  const original = await db.alumniCourseMark.findMany({
      where: { userId: alumni.id },
      select: { courseId: true },
    }),
    context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  context.setDefaultTimeout(10_000);
  try {
    await db.alumniCourseMark.deleteMany({ where: { userId: alumni.id } });
    await login(page, 'alumniMentor');
    await page.goto('/profil/dersler');
    const checks = page.getByRole('checkbox');
    for (let i = 0; i < 5; i++) await checks.nth(i).check();
    await expect(checks.nth(5)).toBeDisabled();
    await page.getByRole('button', { name: t.save, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: t.saved })).toHaveText(t.saved);
    expect(await db.alumniCourseMark.count({ where: { userId: alumni.id } })).toBe(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    const viewer = await context.newPage();
    await login(viewer, 'student');
    await viewer.goto('/ders-rehberi');
    await expect(viewer.locator('article')).toHaveCount(89);
    // Otomatik bekleyen doğrulama: başlıklar makale sayısıyla aynı anda hazır olmayabilir (tek seferlik okuma yarışırdı).
    await expect(viewer.locator('#main-content section > h2')).toHaveText([
      t.departmentCourses,
      t.commonCourses,
    ]);
    await viewer.getByRole('combobox', { name: t.kind, exact: true }).selectOption('elective');
    await viewer.getByRole('button', { name: t.filter, exact: true }).click();
    await expect(viewer.locator('article')).toHaveCount(53);
    expect(await viewer.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  } finally {
    await context.close().catch(() => undefined);
    await db.alumniCourseMark.deleteMany({ where: { userId: alumni.id } });
    if (original.length)
      await db.alumniCourseMark.createMany({
        data: original.map(({ courseId }) => ({ userId: alumni.id, courseId })),
      });
  }
});
