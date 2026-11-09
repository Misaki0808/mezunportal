import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, persona: 'student' | 'alumniMentor' | 'systemAdmin') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  const checks = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}
test('390 px: mezun hikâye gönderir, yönetici seçer, bölüm görür ve rıza geri alınır', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const author = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  const member = await db.membership.findFirstOrThrow({
    where: { userId: author.id, role: 'ALUMNI', endedAt: null },
  });
  expect(
    await db.alumniStory.count({ where: { userId: author.id, departmentId: member.departmentId } }),
  ).toBe(0);
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [alumni, admin, student] = await Promise.all(contexts.map((c) => c.newPage()));
  let storyId: string | undefined;
  try {
    await login(alumni!, 'alumniMentor');
    await alumni!.goto('/hesap/hikayem');
    await alumni!
      .getByLabel('Hikâyen', { exact: true })
      .fill(
        'Öğrenme yolculuğumda merak ve üretkenlikle ilerledim. Her deneyim beni yeni hedeflere taşıdı.',
      );
    await alumni!.getByRole('switch', { name: /Hikâyemin bölümümün üyeleriyle/ }).check();
    await alumni!.getByRole('button', { name: 'İncelemeye gönder' }).click();
    await expect(
      alumni!.getByRole('status').filter({ hasText: 'Hikâyen incelemeye gönderildi.' }),
    ).toBeVisible();
    storyId = (
      await db.alumniStory.findUniqueOrThrow({
        where: { userId_departmentId: { userId: author.id, departmentId: member.departmentId } },
      })
    ).id;
    await login(admin!, 'systemAdmin');
    await admin!.goto('/yonetim/ayin-mezunu');
    await admin!.getByLabel('Bölüm seç').selectOption(member.departmentId);
    await admin!.getByRole('button', { name: 'Hikâyeleri göster' }).click();
    const row = admin!.locator('li').filter({ hasText: TEST_PERSONAS.alumniMentor.name });
    await row.getByRole('button', { name: 'Hikâyeyi onayla' }).click();
    await admin!.getByRole('dialog').getByRole('button', { name: 'Kararı onayla' }).click();
    await expect(admin!.getByText('Hikâye kararı kaydedildi.')).toBeVisible();
    await row.getByRole('button', { name: 'Ayın mezunu seç' }).click();
    await admin!.getByRole('dialog').getByLabel('Gerekçe').fill('Katkısı nedeniyle seçildi');
    await admin!.getByRole('dialog').getByRole('button', { name: 'Kararı onayla' }).click();
    await expect(admin!.getByText('Ayın mezunu seçildi.')).toBeVisible();
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const guest = await guestContext.newPage();
      await guest.goto('/');
      expect(await guest.content()).not.toContain('Öğrenme yolculuğumda merak ve üretkenlikle');
    } finally {
      await guestContext.close();
    }
    await login(student!, 'student');
    await student!.goto('/');
    await expect(student!.getByRole('region', { name: 'Ayın mezunu' })).toContainText(
      TEST_PERSONAS.alumniMentor.name,
    );
    await student!.getByRole('link', { name: /Hikâyeyi oku/ }).click();
    await expect(student!.getByText(/Öğrenme yolculuğumda/)).toBeVisible();
    expect(await student!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await student!.goto('/hikayeler');
    const monthLabel = new Intl.DateTimeFormat('tr-TR', {
      year: 'numeric',
      month: 'long',
      timeZone: 'Europe/Istanbul',
    }).format(new Date());
    await expect(student!.getByRole('region', { name: 'Ayın mezunu' })).toContainText(monthLabel);
    await alumni!.reload();
    await alumni!.getByRole('switch', { name: /Hikâyemin bölümümün üyeleriyle/ }).uncheck();
    await expect(alumni!.getByText('Yayın tercihin kaydedildi.')).toBeVisible();
    await student!.goto('/hikayeler');
    await expect(student!.getByText('Henüz paylaşılmış bir hikâye yok.')).toBeVisible();
  } finally {
    if (storyId) await db.alumniStory.deleteMany({ where: { id: storyId, userId: author.id } });
    await Promise.all(contexts.map((c) => c.close()));
  }
});
