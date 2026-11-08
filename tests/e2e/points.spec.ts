import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

async function login(
  page: Page,
  persona: 'student' | 'systemAdmin' | 'alumniMentor' | 'departmentAdmin',
) {
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

test('profil: katkı puanı, bekleyen puan ve geçmiş görünür', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.pointEntry.deleteMany({
    where: { userId: student.id, sourceId: { startsWith: 'e2e-' } },
  });
  const now = new Date();
  await db.pointEntry.createMany({
    data: [
      {
        userId: student.id,
        action: 'EXPERIENCE_PUBLISHED',
        sourceType: 'EXPERIENCE',
        sourceId: 'e2e-final',
        basePoints: 5,
        points: 5,
        status: 'FINAL',
        eventAt: now,
      },
      {
        userId: student.id,
        action: 'SESSION_IN_PERSON',
        sourceType: 'APPOINTMENT',
        sourceId: 'e2e-pending',
        basePoints: 15,
        points: 15,
        status: 'PENDING',
        eventAt: now,
        finalizesAt: new Date(now.getTime() + 7 * 86_400_000),
      },
    ],
  });
  try {
    await login(page, 'student');
    await page.goto('/profil');
    await page.waitForLoadState('networkidle');
    const section = page.getByRole('region', { name: 'Katkı puanın' });
    await expect(section).toBeVisible();
    await expect(section.getByText('Deneyim yayınlandı').first()).toBeVisible();
    await expect(section.getByText('Yüz yüze görüşme').first()).toBeVisible();
    await expect(section.getByText(/tarihinde kesinleşir/).first()).toBeVisible();
    await expect(
      section.getByText('Bekleyen puan').locator('xpath=following-sibling::dd'),
    ).toContainText(/[1-9]/);
    // Kaynak kimliği ekrana sızmaz.
    await expect(page.locator('body')).not.toContainText('e2e-final');
  } finally {
    await db.pointEntry.deleteMany({
      where: { userId: student.id, sourceId: { startsWith: 'e2e-' } },
    });
  }
});

test('yönetici: kural değişikliği gerekçeyle kaydedilir ve işlem kaydına yazılır', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await db.pointRule.findUniqueOrThrow({ where: { action: 'SESSION_ONLINE' } });
  try {
    await login(page, 'systemAdmin');
    await page.goto('/yonetim/puan');
    await page.waitForLoadState('networkidle');
    await page
      .locator('li')
      .filter({ hasText: 'Çevrimiçi görüşme' })
      .getByRole('button', { name: 'Düzenle' })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Puan/).fill(String(before.points + 2));
    await dialog.getByRole('button', { name: 'Kuralı kaydet' }).click();
    await expect(dialog.getByText('Gerekçe 3–1000 karakter olmalı.')).toBeVisible();
    await dialog.getByLabel(/Gerekçe/).fill('Pilot ayarı');
    await dialog.getByRole('button', { name: 'Kuralı kaydet' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Kural kaydedildi.' })).toBeVisible();
    expect(
      (await db.pointRule.findUniqueOrThrow({ where: { action: 'SESSION_ONLINE' } })).points,
    ).toBe(before.points + 2);
    expect(
      await db.adminAuditLog.count({ where: { action: 'POINT_RULE_CHANGE' } }),
    ).toBeGreaterThan(0);
  } finally {
    await db.pointRule.update({
      where: { action: 'SESSION_ONLINE' },
      data: { points: before.points, delayDays: before.delayDays, isActive: before.isActive },
    });
  }
});

test('gizlilik: puan geçmişi HTML/RSC çıktısında karşı taraf, kaynak ve anonim deneyim bağı yok', async ({
  page,
}) => {
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const marker = `e2e-gizli-${Date.now()}`;
  const now = new Date();
  await db.pointEntry.createMany({
    data: [
      {
        userId: mentor.id,
        action: 'SESSION_ONLINE',
        sourceType: 'APPOINTMENT',
        sourceId: `${marker}-gorusme`,
        counterpartId: student.id,
        basePoints: 10,
        points: 10,
        status: 'FINAL',
        eventAt: now,
      },
      {
        userId: mentor.id,
        action: 'EXPERIENCE_PUBLISHED',
        sourceType: 'EXPERIENCE',
        sourceId: `${marker}-anonim-deneyim`,
        basePoints: 5,
        points: 5,
        status: 'FINAL',
        eventAt: now,
      },
    ],
  });
  try {
    await login(page, 'alumniMentor');
    await page.goto('/profil');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('region', { name: 'Katkı puanın' })).toBeVisible();
    // Sayfa HTML'i (RSC akışı dahil) ve görünür metin.
    const html = await (await page.request.get('/profil')).text();
    for (const secret of [marker, student.id, student.name, 'anonim-deneyim']) {
      expect(html, `HTML'de sızıntı: ${secret}`).not.toContain(secret);
    }
    await expect(page.locator('body')).not.toContainText(student.name);
  } finally {
    await db.pointEntry.deleteMany({ where: { sourceId: { startsWith: marker } } });
  }
});

test('yetki: /yonetim/puan yalnız sistem yöneticisine açık; öğrenci ve bölüm yöneticisi gerçek 404 alır', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  for (const persona of ['student', 'departmentAdmin'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, persona);
    const response = await page.goto('/yonetim/puan');
    expect(response?.status(), persona).toBe(404);
    await expect(page.getByRole('button', { name: 'Kuralı kaydet' })).toHaveCount(0);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, 'systemAdmin');
  expect((await page.goto('/yonetim/puan'))?.status()).toBe(200);
  await context.close();
});

test('yönetici: kayıt iptali gerekçe + onay penceresiyle yapılır ve işlem kaydına yazılır', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const sourceId = `e2e-iptal-${Date.now()}`;
  const entry = await db.pointEntry.create({
    data: {
      userId: student.id,
      action: 'EXPERIENCE_PUBLISHED',
      sourceType: 'EXPERIENCE',
      sourceId,
      basePoints: 5,
      points: 5,
      status: 'FINAL',
      eventAt: new Date(),
    },
  });
  try {
    await login(page, 'systemAdmin');
    await page.goto('/yonetim/puan');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Kayıt' }).click();
    await page.getByLabel(/Kullanıcı kimliği/).fill(student.id);
    await page.getByRole('button', { name: 'Listele' }).click();
    await page.getByRole('button', { name: 'Puanı geri al' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Puanı geri al' }).click();
    await expect(dialog.getByText('Gerekçe 3–1000 karakter olmalı.')).toBeVisible();
    expect((await db.pointEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe(
      'FINAL',
    );
    await dialog.getByLabel(/Gerekçe/).fill('Hatalı kayıt');
    await dialog.getByRole('button', { name: 'Puanı geri al' }).click();
    await expect(page.getByRole('status').filter({ hasText: /geri alındı/i })).toBeVisible();
    const row = await db.pointEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.status).toBe('REVOKED');
    expect(
      await db.adminAuditLog.count({
        where: { action: 'POINTS_REVOKE', targetId: entry.id, reason: 'Hatalı kayıt' },
      }),
    ).toBe(1);
  } finally {
    await db.pointEntry.deleteMany({ where: { sourceId } });
  }
});
