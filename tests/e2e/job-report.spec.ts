import { randomUUID } from 'node:crypto';
import { test, expect } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('öğrenci ilanı bildirir, yönetici kaldırır ve ilanın listeden kalktığı görülür', async ({
  browser,
}, testInfo) => {
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
  const reporter = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.student.email },
    select: { id: true, name: true, email: true },
  });
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();
  const ownerViews: string[] = [];
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const student = await studentContext.newPage();
  const admin = await adminContext.newPage();
  try {
    await loginAs(student, 'student');
    await student.goto(`/ilanlar/${posting.id}`);
    await student.waitForLoadState('networkidle');
    await student.getByRole('button', { name: 'Bu ilanı şikâyet et' }).click();
    await student.getByLabel('Şikâyet nedeni').selectOption({ label: 'Yanıltıcı ilan' });
    await student.getByLabel('Açıklama (isteğe bağlı)').fill('İlan bilgileri yanıltıcı görünüyor.');
    await student.screenshot({
      path: testInfo.outputPath('sikayet-390.png'),
      fullPage: true,
    });
    await student.setViewportSize({ width: 1440, height: 900 });
    await student.screenshot({
      path: testInfo.outputPath('sikayet-1440.png'),
      fullPage: true,
    });
    await student.getByRole('button', { name: 'Şikâyeti gönder' }).click();
    await expect(student.getByText('Şikâyetin alındı. Teşekkürler.')).toBeVisible();
    await loginAs(owner, 'alumniMentor');
    const ownerBefore = await owner.goto('/ilanlarim');
    ownerViews.push(await ownerBefore!.text());
    await expect(owner.getByText(title, { exact: true })).toBeVisible();
    await loginAs(admin, 'systemAdmin');
    await admin.goto('/yonetim');
    await expect(admin.getByRole('link', { name: /Şikâyetler/ })).toContainText('1 bekliyor');
    await admin.goto('/yonetim/sikayetler');
    await expect(admin.getByText('Açık deneyim şikâyeti yok.')).toBeVisible();
    await expect(admin.getByRole('link', { name: `İncele: ${title}` })).toBeVisible();
    const item = admin.locator('li').filter({ hasText: title });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: 'İlanı kaldır' }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Onayla' }).click();
    await expect(dialog.getByLabel(/Karar gerekçesi/)).toBeFocused();
    await expect(dialog.getByLabel(/Karar gerekçesi/)).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByText('En az 3 karakterlik bir gerekçe yaz.')).toBeVisible();
    await dialog.getByLabel(/Karar gerekçesi/).fill('Yanıltıcı ilan tespit edildi.');
    await dialog.getByRole('button', { name: 'Onayla' }).click();
    await expect(item).toHaveCount(0);
    await expect(admin.getByRole('heading', { name: 'Şikâyet kuyruğu', level: 1 })).toBeFocused();
    await expect(admin.getByText('Açık şikâyet yok.')).toBeVisible();
    const ownerAfter = await owner.goto('/ilanlarim');
    ownerViews.push(await ownerAfter!.text());
    await owner.screenshot({
      path: testInfo.outputPath('sahip-karar-sonrasi-390.png'),
      fullPage: true,
    });
    ownerViews.push(
      JSON.stringify(
        await db.adminAuditLog.findMany({
          where: { targetType: 'REPORT', metadata: { path: ['postingId'], equals: posting.id } },
        }),
      ),
    );
    ownerViews.push(
      JSON.stringify(await db.notificationIntent.findMany({ where: { userId: author.id } })),
    );
    for (const body of ownerViews)
      for (const secret of [reporter.id, reporter.name, reporter.email, 'reporterId'])
        expect(body).not.toContain(secret);
    await student.goto('/ilanlar');
    await expect(student.getByText(title)).toHaveCount(0);
    const removedResponse = await student.goto(`/ilanlar/${posting.id}`);
    expect(removedResponse?.status()).toBe(404);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: posting.id } })).status).toBe(
      'CLOSED',
    );
  } finally {
    await Promise.allSettled([studentContext.close(), adminContext.close(), ownerContext.close()]);
    await db.jobPosting.delete({ where: { id: posting.id } });
  }
});
