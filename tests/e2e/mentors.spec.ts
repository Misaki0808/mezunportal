import { loginAs } from './login';
import { expect, test } from './fixture';
import { TEST_PERSONA_EMAILS } from '../../src/server/auth/test-personas';

const login = loginAs;

test('mentor bul: liste, mobil filtre alt sayfası, çip, boş durum ve geçersiz adres', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'student');
  await page.goto('/mentorlar');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Mentor bul' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mert Yıldız' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elif Kaya' })).toBeVisible();
  // E-posta ve telefon kartta yok.
  expect(await page.locator('article').allInnerTexts()).not.toContainEqual(
    expect.stringMatching(/@|\+90/),
  );

  // Mobilde alt sayfa: geçersiz girdi alt sayfayı kapatmaz, hata alanın altında görünür.
  await page.getByRole('button', { name: 'Filtreler' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Şirket').fill('a');
  await sheet.getByRole('button', { name: 'Uygula' }).click();
  await expect(sheet.getByText('En az 2 karakter yaz.')).toBeVisible();
  await sheet.getByLabel('Şirket').fill('');
  await sheet.getByRole('checkbox', { name: 'Mezun', exact: true }).check();
  await sheet.getByRole('switch', { name: /Yalnız müsait olanlar/ }).check();
  await sheet.getByRole('button', { name: 'Uygula' }).click();
  await expect(page).toHaveURL(
    /mentorTypes=ALUMNI.*onlyAvailable=1|onlyAvailable=1.*mentorTypes=ALUMNI/,
  );
  await expect(page.getByRole('heading', { name: 'Mert Yıldız' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elif Kaya' })).toHaveCount(0);
  await expect(page.getByText('1 sonuç')).toBeVisible();

  // Çip tek dokunuşla kalkar.
  await page.getByRole('button', { name: 'Mezun etiketini kaldır' }).click();
  await expect(page.getByRole('heading', { name: 'Elif Kaya' })).toBeVisible();

  // Boş durum yönlendirir; temizle listeyi geri getirir.
  await page.goto('/mentorlar?company=yokboylebirsirket');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Bu filtrelerle mentor bulunamadı')).toBeVisible();
  await page.getByRole('button', { name: 'Filtreleri temizle' }).first().click();
  await expect(page.getByRole('heading', { name: 'Mert Yıldız' })).toBeVisible();

  // Geçersiz adres çökmez: anlaşılır hata + temizle bağlantısı.
  await page.goto('/mentorlar?page=abc');
  await expect(page.getByRole('link', { name: 'Filtreleri temizle' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Profil bağlantısı mentorun profiline gider.
  await page.goto('/mentorlar');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Profili gör' }).first().click();
  await expect(page).toHaveURL(/\/uye\/[A-Za-z0-9-]+$/);
});

test('inceleyici: uzun beceri/gerekçe taşmaz ve bekleyen filtre isteği tekrarlanmaz', async ({
  page,
}) => {
  test.setTimeout(60000);
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../../src/generated/prisma/client');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const { randomUUID } = await import('node:crypto');
  const student = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONA_EMAILS.student },
  });
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: student.id, endedAt: null },
  });
  const mentor = await db.user.create({
    data: {
      name: 'Uzun Mentor ' + randomUUID().slice(0, 8),
      email: `${randomUUID()}@example.invalid`,
      profile: { create: { headline: 'H'.repeat(120) } },
    },
  });
  await db.membership.create({
    data: {
      userId: mentor.id,
      departmentId: membership.departmentId,
      role: 'ALUMNI',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verificationMethod: 'ADMIN',
      verifiedById: mentor.id,
    },
  });
  await db.mentorProfile.create({
    data: {
      userId: mentor.id,
      isActive: true,
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      cvReviewEnabled: false,
    },
  });
  const label = 'W'.repeat(72) + randomUUID().slice(0, 8),
    tag = await db.tag.create({
      data: { kind: 'SKILL', slug: label.toLowerCase(), label, curated: false },
    });
  const profiles = await db.profile.findMany({
    where: { userId: { in: [student.id, mentor.id] } },
    select: { id: true },
  });
  await db.profileTag.createMany({
    data: profiles.map((profile) => ({ profileId: profile.id, tagId: tag.id })),
  });
  const position = await db.position.create({
    data: {
      userId: mentor.id,
      companyRaw: 'C'.repeat(200),
      titleRaw: 'T'.repeat(200),
      source: 'MANUAL',
      isCurrent: true,
      startYear: 2026,
    },
  });
  try {
    await login(page, 'student');
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto('/mentorlar');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      for (const query of ['company=' + 'W'.repeat(100), 'title=' + 'T'.repeat(100)]) {
        await page.goto('/mentorlar?' + query);
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        const remove = page.getByRole('button', { name: /etiketini kaldır/ });
        const box = await remove.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    }
    await page.goto('/mentorlar?mentorTypes=ALUMNI');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Şirket', { exact: true }).filter({ visible: true }).fill('R2Pending');
    let count = 0,
      release!: () => void,
      seen!: () => void;
    const blocked = new Promise<void>((r) => {
        release = r;
      }),
      observed = new Promise<void>((r) => {
        seen = r;
      });
    await page.route('**/mentorlar?*', async (route) => {
      if (route.request().headers()['rsc'] === '1') {
        count++;
        seen();
        await blocked;
      }
      await route.continue();
    });
    try {
      const apply = page.locator('aside button').filter({ hasText: 'Uygula' });
      await apply.click();
      await observed;
      await expect
        .poll(() => apply.evaluate((node: HTMLButtonElement) => node.disabled))
        .toBe(true);
      await page.getByRole('button', { name: 'Filtreleri temizle', exact: true }).first().click();
      await page.getByRole('button', { name: 'Mezun etiketini kaldır' }).click();
      await page.waitForTimeout(200);
      expect(count).toBe(1);
    } finally {
      release();
    }
    await expect(page).toHaveURL(/company=R2Pending/);
    await page.unroute('**/mentorlar?*');
    await page.goto('/uye/' + mentor.id);
    await expect(page.getByRole('heading', { name: 'Mentorla görüş' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'İletişim iste', exact: true })).toBeVisible();
  } finally {
    await db.position.delete({ where: { id: position.id } });
    await db.profileTag.deleteMany({ where: { tagId: tag.id } });
    await db.tag.delete({ where: { id: tag.id } });
    await db.mentorProfile.delete({ where: { userId: mentor.id } });
    await db.membership.deleteMany({ where: { userId: mentor.id } });
    await db.profile.delete({ where: { userId: mentor.id } });
    await db.user.delete({ where: { id: mentor.id } });
    await db.$disconnect();
  }
});
