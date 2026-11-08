import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

type Persona = 'student' | 'alumniMentor' | 'systemAdmin';
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

test('SSS: öğrenci talep eder → mentor cevaplar → moderatör yayımlar → herkese kimliksiz görünür', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Rastgele kelimeler: önceki koşuların SSS'leriyle "benzer" sayılmasın.
  const token = randomUUID().replaceAll('-', '').slice(0, 10);
  const question = `Zorunlu staj başvurusu için tamamlanan ${token} belgesi nasıl hazırlanır?`;
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.rateLimit.deleteMany({});
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [s, m, a] = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    // 1) Öğrenci talep gönderir.
    await login(s!, 'student');
    await s!.goto('/hesap');
    await expect(s!.locator('a[href="/hesap/sss"]')).toBeVisible();
    await expect(s!.locator('a[href="/mentor/sss"]')).toHaveCount(0);
    await s!.goto('/hesap/sss');
    await s!.waitForLoadState('networkidle');
    await s!.getByLabel(/Sorun/).fill(question);
    await s!.getByRole('button', { name: 'Talebi gönder' }).click();
    await expect(s!.getByRole('status').filter({ hasText: 'Talebin alındı' })).toBeVisible();
    await expect(s!.getByRole('region', { name: 'Taleplerim' }).getByText(question)).toBeVisible();
    const row = await db.faqRequest.findFirstOrThrow({ where: { askerId: student.id, question } });
    expect(row.status).toBe('OPEN');

    // 2) Mentor cevaplar.
    await login(m!, 'alumniMentor');
    await m!.goto('/hesap');
    await expect(m!.locator('a[href="/mentor/sss"]')).toBeVisible();
    await expect(m!.locator('a[href="/hesap/sss"]')).toHaveCount(0);
    await m!.goto('/mentor/sss');
    await m!.waitForLoadState('networkidle');
    const card = m!.locator('li').filter({ hasText: question });
    await expect(card).toBeVisible();
    await card
      .getByLabel(/Cevabın/)
      .fill('Okulun staj ofisinden formu al, kurum yetkilisine imzalat ve platforma yükle.');
    await card.getByRole('button', { name: 'Cevabı gönder' }).click();
    await expect(card.getByText('Cevabın kaydedildi.')).toBeVisible();
    expect(await db.faqAnswer.count({ where: { requestId: row.id } })).toBe(1);

    // 3) Moderatör cevabı seçip düzenleyerek yayımlar.
    await login(a!, 'systemAdmin');
    await a!.goto('/yonetim/sss');
    await a!.waitForLoadState('networkidle');
    const queueCard = a!
      .locator('li')
      .filter({ hasText: 'Mentor cevapları' })
      .filter({
        has: a!.getByRole('textbox', { name: /^Soru/ }),
      });
    const mine = queueCard.filter({ hasText: 'staj ofisinden' });
    await expect(mine).toBeVisible();
    await mine.getByRole('button', { name: 'Yayımla' }).click();
    const dialog = a!.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Yayımla' }).click();
    await expect(a!.getByRole('status').filter({ hasText: 'SSS yayımlandı.' })).toBeVisible();
    expect((await db.faqRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PUBLISHED',
    );

    // 4) Öğrenci yayında görür; SSS sayfasında ve aramada kimlik yok.
    await s!.goto('/hesap/sss');
    await s!.waitForLoadState('networkidle');
    await expect(
      s!.getByRole('region', { name: 'Taleplerim' }).getByText('Yayında').first(),
    ).toBeVisible();
    await s!.goto(`/sss?q=${token}`);
    await s!.waitForLoadState('networkidle');
    await expect(s!.getByText(question)).toBeVisible();
    await s!.getByText(question).click();
    await expect(s!.getByText('staj ofisinden')).toBeVisible();
    const html = await s!.content();
    for (const name of [student.name, student.email]) expect(html).not.toContain(name);
  } finally {
    await db.pointEntry.deleteMany({
      where: { sourceType: { in: ['FAQ_REQUEST', 'FAQ_ANSWER'] } },
    });
    await db.faqItem.deleteMany({ where: { request: { question } } });
    await db.faqAnswer.deleteMany({ where: { request: { question } } });
    await db.faqRequest.deleteMany({ where: { question } });
    await Promise.all(contexts.map((context) => context.close()));
  }
});
