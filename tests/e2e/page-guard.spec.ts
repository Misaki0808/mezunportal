import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ viewport: { width: 390, height: 664 }, colorScheme });
    test('açık oturumun üyeliği sona erince giriş yerine doğrulama ekranı ve geri dönüş', async ({
      page,
    }, info) => {
      await loginAs(page, 'student');
      await page.goto('/hesap/cv-inceleme');
      await expect(
        page.getByRole('heading', { name: 'CV incelemeleri', exact: true }),
      ).toBeVisible();
      // Oturumdaki seed öğrencinin yalnız bu koşuya ait geçici DB'deki üyeliği değişir.
      const student = await db.user.findUniqueOrThrow({
        where: { email: 'student@test.mezunportal.local' },
        select: { id: true },
      });
      const memberships = await db.membership.findMany({
        where: { userId: student.id, endedAt: null },
        select: { id: true },
      });
      const ids = memberships.map((m) => m.id);
      expect(ids.length).toBeGreaterThan(0);
      try {
        await db.membership.updateMany({
          where: { id: { in: ids } },
          data: { endedAt: new Date() },
        });
        await page.reload();
        await expect(
          page.getByRole('heading', { name: 'Üyeliğini doğrulaman gerekiyor', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('main').getByRole('link', { name: 'Giriş yap', exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('link', { name: 'Doğrulamaya git', exact: true }),
        ).toHaveAttribute('href', '/dogrulama');
        await expect(
          page.getByRole('heading', { name: 'Gönderdiğim talepler', exact: true }),
        ).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({ path: info.outputPath('uyelik-kapisi.png') });
        // Sunucu doğru hedefi gerçekten açar; yalnız href varlığı sınanmıyor.
        await page.getByRole('link', { name: 'Doğrulamaya git', exact: true }).click();
        await expect(page).toHaveURL(/\/dogrulama$/);
      } finally {
        await db.membership.updateMany({ where: { id: { in: ids } }, data: { endedAt: null } });
      }
      await page.goto('/hesap/cv-inceleme');
      await expect(
        page.getByRole('heading', { name: 'CV incelemeleri', exact: true }),
      ).toBeVisible();
    });
  });
}
