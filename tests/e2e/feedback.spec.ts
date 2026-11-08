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

test('inceleyici: başka katılımcının form adresi veri vermeden gerçek 404 döner', async ({
  page,
}) => {
  const row = await db.appointment.findFirstOrThrow({
    where: {
      status: 'COMPLETED',
      mentor: { email: 'alumni-mentor@test.mezunportal.local' },
      mentee: { email: 'student@test.mezunportal.local' },
    },
  });
  await page.goto('/giris/test?persona=academic');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await page.waitForLoadState('networkidle');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
  const response = await page.goto('/hesap/gorusme/' + row.id);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('button', { name: 'Yanıtı gönder' })).toHaveCount(0);
  const html = await response!.text();
  expect(html).not.toContain('Mert Yıldız');
  expect(html).not.toContain('Deniz Aksoy');
});

test('inceleyici: gösterge kendi öğrencisine ve talep mentoruna açık, başka öğrenci/profil HTML-RSC çıktısına kapalı', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const student = await db.user.findUniqueOrThrow({
      where: { email: 'student@test.mezunportal.local' },
    }),
    mentor = await db.user.findUniqueOrThrow({
      where: { email: 'alumni-mentor@test.mezunportal.local' },
    }),
    now = Date.now(),
    ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const end = new Date(now - (60 + i) * 86400000);
    const row = await db.appointment.create({
      data: {
        mentorId: mentor.id,
        menteeId: student.id,
        startsAt: new Date(end.getTime() - 3600000),
        endsAt: end,
        expiresAt: new Date(end.getTime() - 4 * 3600000),
        decidedAt: new Date(end.getTime() - 5 * 3600000),
        mode: 'ONLINE',
        status: i === 3 ? 'NO_SHOW' : 'COMPLETED',
      },
    });
    ids.push(row.id);
  }
  const future = new Date(now + 7 * 86400000),
    request = await db.appointment.create({
      data: {
        mentorId: mentor.id,
        menteeId: student.id,
        startsAt: future,
        endsAt: new Date(future.getTime() + 3600000),
        expiresAt: new Date(now + 86400000),
        mode: 'ONLINE',
        status: 'REQUESTED',
      },
    });
  ids.push(request.id);
  const reason = 'Son 12 ayda 4 görüşmenin 1 tanesine katılım olmadı.';
  async function login(persona: string) {
    await page.goto('/giris/test?persona=' + persona);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/(hesap|onay)$/);
    await page.goto('/onay');
    await page.waitForLoadState('networkidle');
    const boxes = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
  }
  try {
    await login('student');
    await page.goto('/hesap/guvenilirlik');
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
    await login('seniorMentor');
    await page.goto('/hesap/guvenilirlik');
    await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
    for (const headers of [{}, { RSC: '1' }]) {
      const response = await context.request.get('/uye/' + student.id, { headers });
      const body = await response.text();
      expect(body).not.toContain(reason);
      expect(body).not.toContain('"noShow":1');
    }
    await login('alumniMentor');
    await page.goto('/hesap/gorusmeler');
    const card = page.locator('li').filter({ hasText: 'Bekleyen randevu talebi' });
    await expect(card.getByText('Dikkat', { exact: true })).toBeVisible();
    await page.goto('/hesap/guvenilirlik');
    await expect(page.getByText('Bu işlem için yetkin yok.', { exact: true })).toBeVisible();
    await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
  } finally {
    await db.appointment.deleteMany({ where: { id: { in: ids } } });
  }
});
