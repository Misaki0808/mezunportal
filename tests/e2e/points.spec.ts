import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

async function login(page: Page, persona: 'student' | 'systemAdmin') {
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
