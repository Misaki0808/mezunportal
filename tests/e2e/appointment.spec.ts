import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

type Persona = 'student' | 'alumniMentor';
async function login(page: Page, persona: Persona) {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}

test('randevu: mentor müsaitlik açar → öğrenci slot seçip talep eder → mentor onaylar', async ({
  browser,
}) => {
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.appointment.deleteMany({
    where: { mentorId: mentor.id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
  });
  await db.availabilityRule.deleteMany({ where: { mentorId: mentor.id } });
  await db.mentorProfile.update({
    where: { userId: mentor.id },
    data: { isActive: true, pausedUntil: null },
  });
  await db.rateLimit.deleteMany({});

  const mentorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mentorContext.newPage();
  const s = await studentContext.newPage();
  try {
    // 1) Mentor haftalık müsaitliği gün listesinden açar.
    await login(m, 'alumniMentor');
    await m.goto('/mentor/ayarlar');
    await m.waitForLoadState('networkidle');
    for (const day of ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']) {
      await m.getByRole('switch', { name: `${day} günü müsait` }).check();
    }
    await m.getByRole('button', { name: 'Müsaitliği kaydet' }).click();
    await expect(m.getByText('Kaydedildi.')).toBeVisible();
    expect(await db.availabilityRule.count({ where: { mentorId: mentor.id } })).toBe(7);

    // 2) Öğrenci slot seçip talep eder.
    await login(s, 'student');
    await s.goto(`/randevu-al/${mentor.id}`);
    await s.waitForLoadState('networkidle');
    await expect(s.getByText('Saatler İstanbul saatidir.')).toBeVisible();
    await s
      .getByRole('radio', { name: /saatini seç/ })
      .first()
      .click();
    await s.getByLabel(/Mentora not/).fill('Staj başvurusu hakkında soru.');
    await s.getByRole('button', { name: 'Randevu talep et' }).click();
    await expect(s.getByRole('heading', { name: 'Talebin gönderildi' })).toBeVisible();
    const row = await db.appointment.findFirstOrThrow({
      where: { mentorId: mentor.id, menteeId: student.id },
    });
    expect(row.status).toBe('REQUESTED');

    // 3) Mentor gelen talebi açıp onaylar.
    await m.goto('/randevular');
    await m.waitForLoadState('networkidle');
    await expect(m.getByText('Yanıt bekliyor').first()).toBeVisible();
    await m.goto(`/randevular/${row.id}`);
    await m.waitForLoadState('networkidle');
    await expect(m.getByText('Staj başvurusu hakkında soru.')).toBeVisible();
    await m.getByRole('button', { name: 'Onayla' }).click();
    await expect(m.getByText('Onaylandı').first()).toBeVisible();
    expect((await db.appointment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'CONFIRMED',
    );

    // 4) Öğrenci Giden sekmesinde onaylı randevuyu görür.
    await s.goto('/randevular');
    await s.waitForLoadState('networkidle');
    await expect(s.getByText('Onaylandı').first()).toBeVisible();
  } finally {
    await db.appointment.deleteMany({
      where: { mentorId: mentor.id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
    });
    await mentorContext.close();
    await studentContext.close();
  }
});
