import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { addMembership, createUser } from '../../src/test/fixtures';
import { loginAs } from './login';
import { expect, test } from './fixture';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`profil ve iletişim güvenliği (${colorScheme})`, () => {
    test.use({ colorScheme, viewport: { width: 390, height: 844 } });
    test('iletişim bilgisi kaydedilmez, düzeltilen metin kaydolur, bekleyen talep önceden açıklanır', async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      const student = await db.user.findUniqueOrThrow({
        where: { email: 'student@test.mezunportal.local' },
      });
      const membership = await db.membership.findFirstOrThrow({
        where: { userId: student.id, role: 'STUDENT', endedAt: null },
      });
      const target = await createUser(db, { name: 'Örnek İletişim Mezunu' });
      await addMembership(db, {
        userId: target,
        departmentId: membership.departmentId,
        role: 'ALUMNI',
        graduationYear: 2020,
      });
      const original = await db.profile.findUnique({ where: { userId: student.id } });
      try {
        await loginAs(page, 'student');
        await page.goto('/profil');
        await page.getByRole('button', { name: 'Profilimi düzenle', exact: true }).first().click();
        const dialog = page.getByRole('dialog');
        const summary = dialog.getByLabel('Özet', { exact: true });
        await summary.fill('+90 532 123 45 67');
        await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
        await expect(summary).toHaveAttribute('aria-invalid', 'true');
        await expect(summary).toHaveAccessibleDescription(
          /Bu alana telefon, e-posta veya kimlik numarası yazma/,
        );
        expect(
          (await db.profile.findUnique({ where: { userId: student.id } }))?.summary ?? null,
        ).toBe(original?.summary ?? null);
        await page.screenshot({ path: info.outputPath('profil-alan-hatasi.png') });
        await summary.fill('2026 yılında 3 proje geliştirdim. https://example.org/projeler');
        await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        expect(
          (await db.profile.findUniqueOrThrow({ where: { userId: student.id } })).summary,
        ).toBe('2026 yılında 3 proje geliştirdim. https://example.org/projeler');
        await page.goto(`/iletisim-iste/${target}`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('checkbox', { name: 'E-posta', exact: true }).check();
        await page.getByRole('button', { name: 'Talep gönder', exact: true }).click();
        await expect(page.getByText(/Yanıtı Gönderilen kutusundan/)).toBeVisible();
        await page.goto(`/iletisim-iste/${target}`);
        await expect(
          page.getByText('Bu kişiye bekleyen bir isteğin var.', { exact: true }),
        ).toBeVisible();
        const submit = page.getByRole('button', { name: 'Talep gönder', exact: true });
        await expect(submit).toBeDisabled();
        await expect(submit).toHaveAccessibleDescription('Bu kişiye bekleyen bir isteğin var.');
        expect(
          await db.contactRequest.count({
            where: {
              requesterId: student.id,
              targetId: target,
              source: 'PROFILE',
              status: 'PENDING',
            },
          }),
        ).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({ path: info.outputPath('bekleyen-talep.png') });
      } finally {
        await db.contactRequest.deleteMany({
          where: { requesterId: student.id, targetId: target },
        });
        await db.profile.updateMany({
          where: { userId: student.id },
          data: {
            headline: original?.headline ?? null,
            summary: original?.summary ?? null,
            city: original?.city ?? null,
            goals: original?.goals ?? null,
            manualFields: original?.manualFields ?? [],
            completionScore: original?.completionScore ?? 0,
          },
        });
      }
    });
  });
}
