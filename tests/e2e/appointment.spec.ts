import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

type Persona = 'student' | 'alumniMentor' | 'seniorMentor';
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
      where: { mentorId: mentor.id, menteeId: student.id, status: 'REQUESTED' },
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

test('inceleyici: iki oturum aynı slot için yarışır; kaybeden SLOT_TAKEN görür ve liste yenilenir', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const actorIds = (
    await db.user.findMany({
      where: {
        email: { in: ['student@test.mezunportal.local', 'senior-mentor@test.mezunportal.local'] },
      },
      select: { id: true },
    })
  ).map((row) => row.id);
  const beforeIds = (
    await db.appointment.findMany({ where: { mentorId: mentor.id }, select: { id: true } })
  ).map((row) => row.id);
  const profile = await db.mentorProfile.findUniqueOrThrow({ where: { userId: mentor.id } });
  const rules = await db.availabilityRule.findMany({ where: { mentorId: mentor.id } });
  const contexts = await Promise.all(
    [1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    await db.mentorProfile.update({
      where: { userId: mentor.id },
      data: {
        isActive: true,
        pausedUntil: null,
        monthlyCapacity: 40,
        sessionMinutes: 30,
        meetingModes: ['ONLINE'],
      },
    });
    await db.availabilityRule.deleteMany({ where: { mentorId: mentor.id } });
    await db.availabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        mentorId: mentor.id,
        weekday: i + 1,
        startMinute: 540,
        endMinute: 1020,
        mode: null,
      })),
    });
    await login(pages[0]!, 'student');
    await login(pages[1]!, 'seniorMentor');
    for (const page of pages) {
      await page.goto(`/randevu-al/${mentor.id}`);
      await page.waitForLoadState('networkidle');
    }
    const label = await pages[0]!
      .getByRole('radio', { name: /saatini seç/ })
      .first()
      .getAttribute('aria-label');
    for (const page of pages) await page.getByRole('radio', { name: label!, exact: true }).click();
    let arrived = 0,
      release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refreshed: boolean[] = [false, false];
    for (const [index, page] of pages.entries()) {
      page.on('response', (response) => {
        if (response.url().includes('/randevu-al/') && response.request().headers().rsc === '1')
          refreshed[index] = true;
      });
      await page.route('**/randevu-al/*', async (route) => {
        if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
          arrived++;
          if (arrived === 2) release();
          await gate;
        }
        await route.continue();
      });
    }
    await Promise.all(
      pages.map((page) => page.getByRole('button', { name: 'Randevu talep et' }).click()),
    );
    await expect
      .poll(
        async () =>
          await db.appointment.count({
            where: {
              mentorId: mentor.id,
              menteeId: { in: actorIds },
              status: 'REQUESTED',
              id: { notIn: beforeIds },
            },
          }),
      )
      .toBe(1);
    await expect
      .poll(async () =>
        (
          await Promise.all(
            pages.map((page) => page.getByRole('heading', { name: 'Talebin gönderildi' }).count()),
          )
        ).reduce((a, b) => a + b, 0),
      )
      .toBe(1);
    const loser = (await pages[0]!.getByRole('heading', { name: 'Talebin gönderildi' }).count())
      ? 1
      : 0;
    await expect(pages[loser]!.getByRole('alert')).toHaveText(/az önce başkası tarafından alındı/);
    await expect(pages[loser]!.getByRole('radio', { name: label!, exact: true })).toHaveCount(0);
    await expect.poll(() => refreshed[loser]).toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await db.appointment.deleteMany({
      where: { mentorId: mentor.id, menteeId: { in: actorIds }, id: { notIn: beforeIds } },
    });
    await db.availabilityRule.deleteMany({ where: { mentorId: mentor.id } });
    if (rules.length)
      await db.availabilityRule.createMany({
        data: rules.map(({ mentorId, weekday, startMinute, endMinute, mode }) => ({
          mentorId,
          weekday,
          startMinute,
          endMinute,
          mode,
        })),
      });
    await db.mentorProfile.update({
      where: { userId: mentor.id },
      data: {
        isActive: profile.isActive,
        pausedUntil: profile.pausedUntil,
        monthlyCapacity: profile.monthlyCapacity,
        sessionMinutes: profile.sessionMinutes,
        meetingModes: profile.meetingModes,
      },
    });
  }
});
