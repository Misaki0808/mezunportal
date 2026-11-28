import { loginAs } from './login';
import { expect, test } from './fixture';
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
  const privateNote = `GizliSentetik${appointment.id}`;
  try {
    await loginAs(page, 'student');
    await page.goto(`/hesap/gorusme/${appointment.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
    const happened = page.getByRole('radio', { name: 'Evet, gerçekleşti' });
    await expect(happened).toBeFocused();
    await expect(happened).toHaveAttribute('aria-invalid', 'true');
    await expect(happened).toHaveAccessibleDescription(/gerçekleşip gerçekleşmediğini seç/);
    await page.getByRole('radio', { name: 'Evet, gerçekleşti' }).check();
    const evidenceDir = process.env.FEEDBACK_EVIDENCE_DIR;
    if (evidenceDir) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.screenshot({ path: `${evidenceDir}/ogrenci-${width}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const ratingTarget = await page
      .getByRole('radio', { name: '4,5 / 5' })
      .locator('..')
      .boundingBox();
    expect(ratingTarget!.width).toBeGreaterThanOrEqual(44);
    expect(ratingTarget!.height).toBeGreaterThanOrEqual(44);

    await page
      .getByRole('group', { name: 'Mentor seni dinledi ve sorularınla ilgilendi mi?' })
      .getByRole('radio', { name: 'Evet' })
      .check();
    await page
      .getByRole('group', {
        name: 'Görüşmeden işine yarayacak somut bir şey çıktı mı? (yol haritası, kaynak, tavsiye)',
      })
      .getByRole('radio', { name: 'Kısmen' })
      .check();
    await page
      .getByRole('group', { name: 'Görüşme zamanında başladı mı?' })
      .getByRole('radio', { name: 'Zamanında' })
      .check();
    await page.getByRole('radio', { name: '4,5 / 5' }).check();
    await page.getByLabel('Eklemek istediğin bir şey var mı?').fill(privateNote);
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
    const studentFeedback = await db.sessionFeedback.findUniqueOrThrow({
      where: { appointmentId_authorId: { appointmentId: appointment.id, authorId: student.id } },
    });
    expect(studentFeedback).toMatchObject({ answerTwo: 'PARTIAL', ratingHalf: 9, helpful: true });
    await loginAs(page, 'alumniMentor');
    for (const headers of [{}, { RSC: '1' }]) {
      const response = await page
        .context()
        .request.get(`/hesap/gorusme/${appointment.id}`, { headers });
      expect(await response.text()).not.toContain(privateNote);
    }
    await page.goto(`/hesap/gorusme/${appointment.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('radio', { name: 'Evet, gerçekleşti' }).check();
    if (evidenceDir) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.screenshot({ path: `${evidenceDir}/mentor-${width}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }

    await page
      .getByRole('group', { name: 'Öğrenci istekli ve ilgili miydi?' })
      .getByRole('radio', { name: 'Çok istekliydi' })
      .check();
    await page
      .getByRole('group', {
        name: 'Öğrenci görüşmeye hazırlıklı geldi mi? (soruları, hedefi, CV’si)',
      })
      .getByRole('radio', { name: 'Kısmen' })
      .check();
    await page
      .getByRole('group', { name: 'Öğrenci zamanında katıldı mı?' })
      .getByRole('radio', { name: 'Zamanında' })
      .check();
    await page.getByRole('radio', { name: '4,5 / 5' }).check();
    await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Yanıtın kaydedildi' })).toBeVisible();
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(
      'COMPLETED',
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
  await loginAs(page, 'academic');
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
  const login = (persona: Parameters<typeof loginAs>[1]) => loginAs(page, persona);
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
