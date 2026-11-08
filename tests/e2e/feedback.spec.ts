import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test('öğrenci görüşme formunu 390 pikselde doldurur ve ikinci kez gönderemez', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  // Kanıt veya başka test randevularıyla çakışmayan geçmiş aralık.
  const now = Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 300) * 86400000;
  const appointment = await db.appointment.create({
    data: {
      mentorId: mentor.id,
      menteeId: student.id,
      startsAt: new Date(now - 3 * 3600000),
      endsAt: new Date(now - 2 * 3600000),
      expiresAt: new Date(now - 4 * 3600000),
      decidedAt: new Date(now - 5 * 3600000),
      mode: 'ONLINE',
      status: 'CONFIRMED',
    },
  });
  try {
    await page.goto('/giris/test?persona=student');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/(hesap|onay)$/);
    await page.goto('/onay');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true })
      .nth(0)
      .check();
    await page
      .getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true })
      .nth(1)
      .check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
    await page.goto(`/hesap/gorusme/${appointment.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('radio', { name: 'Evet, gerçekleşti' }).check();
    await page.getByRole('radio', { name: 'Evet, faydalıydı' }).check();
    await page.getByLabel('Eklemek istediğin bir şey var mı?').fill('Görüşme faydalıydı.');
    await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Yanıtın kaydedildi' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Bu görüşme için yanıtını gönderdin.')).toBeVisible();
    expect(
      await db.sessionFeedback.count({
        where: { appointmentId: appointment.id, authorId: student.id },
      }),
    ).toBe(1);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(
      'CONFIRMED',
    );
  } finally {
    await db.appointment.delete({ where: { id: appointment.id } });
  }
});
