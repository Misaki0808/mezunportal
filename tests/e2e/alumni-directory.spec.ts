import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test('mezun açıkça katılır, aynı üniversitenin öğrencisi bulur; kapatınca kaybolur', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const alumnus = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
    select: { id: true, name: true },
  });
  await db.profile.upsert({
    where: { userId: alumnus.id },
    create: { userId: alumnus.id, alumniDirectoryVisible: false },
    update: { alumniDirectoryVisible: false },
  });
  await loginAs(page, 'alumniMentor');
  await page.goto('/profil');
  const checkbox = page.getByRole('checkbox', { name: /Mezun rehberinde görün/ });
  await expect(checkbox.locator('xpath=ancestor::section[1]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(page.getByText('Tercihin kaydedildi.')).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, 'student');
  await page.goto('/mezunlar');
  await expect(page.getByRole('heading', { name: alumnus.name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.context().clearCookies();
  await loginAs(page, 'alumniMentor');
  await page.goto('/profil');
  await expect(checkbox.locator('xpath=ancestor::section[1]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await checkbox.uncheck();
  await expect(page.getByText('Tercihin kaydedildi.')).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, 'student');
  await page.goto('/mezunlar');
  await expect(page.getByRole('heading', { name: alumnus.name })).toHaveCount(0);
});
