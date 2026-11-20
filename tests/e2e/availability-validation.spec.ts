import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { expect, test } from './fixture';
import { waitForFormReady } from './hydration';
import { loginAs } from './login';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test('geceyi aşan tek aralık reddi ve iki güne bölerek kaydetme', async ({ page }) => {
  test.setTimeout(60000);
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'alumniMentor');
  await page.goto('/mentor/ayarlar');
  // Hidratasyondan önce açılan gün anahtarı ve yazılan saatler React durumuna işlenmez (hidratasyonda tohum değerine döner).
  const wednesday = page.getByRole('switch', { name: 'Çarşamba günü müsait' });
  await waitForFormReady(wednesday);
  await wednesday.check();
  const wed = page.getByRole('group', { name: 'Çarşamba, 1. aralık' });
  await wed.getByLabel('Başlangıç').fill('23:00');
  await wed.getByLabel('Bitiş').fill('01:00');
  await page.getByRole('button', { name: 'Haftalık saatleri kaydet' }).click();
  const end = wed.getByLabel('Bitiş');
  await expect(wed.getByText(/Gece yarısını geçen saatler için iki aralık ekle/)).toBeVisible();
  await expect(end).toBeFocused();
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(end).toHaveAccessibleDescription(/23:00–00:00 ve ertesi gün 00:00–01:00/);
  await expect(wed.getByLabel('Başlangıç')).not.toHaveAttribute('aria-invalid', 'true');
  const startBox = await wed.getByLabel('Başlangıç').boundingBox();
  const endBox = await end.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  expect(Math.abs(startBox!.x - endBox!.x)).toBeLessThanOrEqual(1);
  expect(endBox!.y).toBeGreaterThan(startBox!.y + startBox!.height);
  await wed.scrollIntoViewIfNeeded();
  if (process.env.AVAILABILITY_EVIDENCE) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await wed.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${process.env.AVAILABILITY_EVIDENCE}/musaitlik-${width}.png`,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await wed.getByLabel('Bitiş').fill('00:00');
  await page.getByRole('switch', { name: 'Perşembe günü müsait' }).check();
  const thu = page.getByRole('group', { name: 'Perşembe, 1. aralık' });
  await thu.getByLabel('Başlangıç').fill('00:00');
  await thu.getByLabel('Bitiş').fill('01:00');
  await page.getByRole('button', { name: 'Haftalık saatleri kaydet' }).click();
  await expect(page.getByText('Kaydedildi.')).toBeVisible();
  const rules = await db.availabilityRule.findMany({
    where: { mentorId: mentor.id, weekday: { in: [3, 4] } },
    select: { weekday: true, startMinute: true, endMinute: true },
  });
  expect(rules).toEqual(
    expect.arrayContaining([
      { weekday: 3, startMinute: 1380, endMinute: 1440 },
      { weekday: 4, startMinute: 0, endMinute: 60 },
    ]),
  );
});
