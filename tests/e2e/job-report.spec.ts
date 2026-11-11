import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { waitForHydratedForm } from './hydration';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, persona: 'student' | 'systemAdmin') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.waitForLoadState('networkidle');
  const submit = page.getByRole('button', { name: 'Test hesabıyla giriş yap' });
  await expect(async () => {
    if (new URL(page.url()).pathname === '/giris/test') await submit.click();
    await expect(page).not.toHaveURL(/\/giris\/test(?:\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 20_000, intervals: [500] });
  const consent = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  const account = page.getByRole('heading', { name: 'Hesabın', exact: true });
  await expect(account.or(consent.first())).toBeVisible({ timeout: 20_000 });
  if (await consent.first().isVisible()) {
    await waitForHydratedForm(page, 'Seçimlerimi kaydet');
    await consent.nth(0).check();
    await consent.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
    await page.waitForURL((url) => url.pathname !== '/onay', { timeout: 20_000 });
  }
  await page.waitForLoadState('networkidle');
}

test('öğrenci ilanı bildirir, yönetici kaldırır ve ilanın listeden kalktığı görülür', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const title = `Şikâyet testi ${randomUUID()}`;
  const author = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: author.id, role: 'ALUMNI', endedAt: null },
  });
  const moderator = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.systemAdmin.email },
  });
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 20);
  const posting = await db.jobPosting.create({
    data: {
      title,
      authorId: author.id,
      departmentIdAtWrite: membership.departmentId,
      kind: 'INTERNSHIP',
      organizationName: 'Örnek Kurum',
      location: 'İstanbul',
      description: 'Bu ilan şikâyet akışını denemek için oluşturulmuştur.',
      status: 'PUBLISHED',
      submittedAt: new Date(),
      moderatedAt: new Date(),
      moderatedById: moderator.id,
      publishedAt: new Date(),
      deadlineOn: deadline,
      applyMethod: 'URL',
      applyUrl: 'https://example.org/staj',
      targets: { create: { departmentId: membership.departmentId } },
    },
  });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const student = await studentContext.newPage();
  const admin = await adminContext.newPage();
  try {
    await login(student, 'student');
    await student.goto(`/ilanlar/${posting.id}`);
    await student.waitForLoadState('networkidle');
    await student.getByRole('button', { name: 'Bu ilanı şikâyet et' }).click();
    await student.getByLabel('Şikâyet nedeni').selectOption({ label: 'Yanıltıcı ilan' });
    await student.getByLabel('Açıklama (isteğe bağlı)').fill('İlan bilgileri yanıltıcı görünüyor.');
    await student.screenshot({
      path: '/Users/efe_baydemir/Okul/Bitirme Projem/pm-handoff/kanit/216-sikayet-390.png',
      fullPage: true,
    });
    await student.setViewportSize({ width: 1440, height: 900 });
    await student.screenshot({
      path: '/Users/efe_baydemir/Okul/Bitirme Projem/pm-handoff/kanit/216-sikayet-1440.png',
      fullPage: true,
    });
    await student.getByRole('button', { name: 'Şikâyeti gönder' }).click();
    await expect(student.getByText('Şikâyetin alındı. Teşekkürler.')).toBeVisible();
    await login(admin, 'systemAdmin');
    await admin.goto('/yonetim/sikayetler');
    const item = admin.locator('li').filter({ hasText: title });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: 'İlanı kaldır' }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByLabel(/Karar gerekçesi/).fill('Yanıltıcı ilan tespit edildi.');
    await dialog.getByRole('button', { name: 'Onayla' }).click();
    await expect(item).toHaveCount(0);
    await student.goto('/ilanlar');
    await expect(student.getByText(title)).toHaveCount(0);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: posting.id } })).status).toBe(
      'CLOSED',
    );
  } finally {
    await Promise.allSettled([studentContext.close(), adminContext.close()]);
    await db.jobPosting.delete({ where: { id: posting.id } });
  }
});
