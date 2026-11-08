import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { waitForHydratedControl, waitForHydratedForm } from './hydration';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, persona: 'student' | 'alumniMentor' | 'systemAdmin') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  const consent = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await consent.nth(0).check();
  await consent.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}
test('mezun ilan verir, yönetici yayımlar ve öğrenci bulur', async ({ browser }) => {
  test.setTimeout(120_000);
  const title = `Staj ${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [alumni, admin, student] = await Promise.all(contexts.map((c) => c.newPage()));
  let postingId: string | undefined;
  try {
    await login(alumni!, 'alumniMentor');
    await alumni!.goto('/ilanlar/yeni');
    await waitForHydratedControl(alumni!, 'Devam et');
    await alumni!.getByLabel('Pozisyon adı').fill(title);
    await alumni!.getByLabel('Kurum adı').fill('Örnek Teknoloji');
    await alumni!.getByRole('button', { name: 'Devam et' }).click();
    await alumni!
      .getByLabel('Açıklama')
      .fill(
        'Öğrenciler için ekip çalışması ve yazılım geliştirme odaklı örnek bir staj fırsatıdır.',
      );
    await alumni!.getByLabel('Konum', { exact: true }).fill('İstanbul');
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + 20);
    await alumni!.getByLabel('Son başvuru tarihi').fill(now.toISOString().slice(0, 10));
    await alumni!
      .getByRole('checkbox', { name: /Yönetim Bilişim Sistemleri/ })
      .first()
      .check();
    await alumni!.getByLabel('HTTPS başvuru bağlantısı').fill('https://example.org/staj');
    await alumni!.getByRole('button', { name: 'Devam et' }).click();
    await alumni!.getByRole('button', { name: 'İncelemeye gönder' }).click();
    await alumni!.waitForURL('**/ilanlarim');
    await expect(alumni!.getByText(title)).toBeVisible();
    await expect(alumni!.getByText('İncelemede')).toBeVisible();
    const record = await db.jobPosting.findFirstOrThrow({ where: { title } });
    postingId = record.id;
    await login(admin!, 'systemAdmin');
    await admin!.goto('/yonetim/ilanlar');
    await waitForHydratedControl(admin!, 'Yayımla');
    const card = admin!.locator('li').filter({ hasText: title });
    await card.getByRole('button', { name: 'Yayımla' }).click();
    await admin!.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
    await expect(card).toHaveCount(0);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: postingId } })).status).toBe(
      'PUBLISHED',
    );
    await login(student!, 'student');
    await student!.goto('/ilanlar');
    await student!.getByLabel('Pozisyon veya kurum ara').fill(title);
    await student!.getByRole('button', { name: 'Ara', exact: true }).click();
    await expect(student!.getByRole('heading', { name: title })).toBeVisible();
    await student!.getByRole('heading', { name: title }).getByRole('link').click();
    const apply = student!.getByRole('link', { name: /Başvur/ });
    await expect(apply).toHaveAttribute('href', 'https://example.org/staj');
    await expect(apply).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(student!.getByRole('link', { name: 'İlan ver' })).toHaveCount(0);
    // Aynı yayın için D7 yöntemini sınayan sentetik senaryo: yazar kimliği HTML'e taşınmaz.
    const writer = await db.user.findUniqueOrThrow({ where: { id: record.authorId } });
    await db.jobPosting.update({
      where: { id: postingId },
      data: { applyMethod: 'CONTACT_REQUEST', applyUrl: null },
    });
    await student!.reload();
    const html = await student!.content();
    expect(html).not.toContain(writer.id);
    expect(html).not.toContain(writer.name);
    await student!.getByRole('link', { name: 'İletişim iste' }).click();
    await expect(student!.getByText(title)).toBeVisible();
    expect(await student!.content()).not.toContain(writer.id);
    await waitForHydratedForm(student!, 'Talep gönder');
    await student!.getByRole('checkbox', { name: 'E-posta' }).check();
    await student!.getByRole('button', { name: 'Talep gönder' }).click();
    await expect(student!.getByRole('status')).toContainText('Talebin gönderildi');
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    if (postingId) {
      await db.contactRequest.deleteMany({ where: { message: { contains: title } } });
      await db.pointEntry.deleteMany({ where: { sourceType: 'JOB_POSTING', sourceId: postingId } });
      await db.jobPosting.deleteMany({ where: { id: postingId } });
    }
  }
});
