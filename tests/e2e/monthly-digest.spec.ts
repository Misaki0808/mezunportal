import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('aylık özetten girişsiz çıkış ve tekrar kullanım mobilde çalışır', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const subject = Buffer.from(user.id).toString('base64url');
  const mac = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
    .update(`monthly-digest:unsubscribe:v1:${subject}`)
    .digest('base64url');
  const token = `${subject}.${mac}`;
  try {
    await db.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: 'MONTHLY_DIGEST' } },
      create: { userId: user.id, type: 'MONTHLY_DIGEST', enabled: true },
      update: { enabled: true },
    });
    for (let i = 0; i < 2; i++) {
      await page.goto(`/aylik-ozet/abonelikten-cik#token=${token}`);
      await expect(
        page.getByRole('status').filter({ hasText: 'aboneliğin kapatıldı' }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await db.notificationPreference.findUniqueOrThrow({
                where: { userId_type: { userId: user.id, type: 'MONTHLY_DIGEST' } },
              })
            ).enabled,
        )
        .toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  } finally {
    await db.notificationPreference.deleteMany({
      where: { userId: user.id, type: 'MONTHLY_DIGEST' },
    });
  }
});
