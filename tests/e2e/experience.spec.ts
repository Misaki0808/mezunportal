import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

type Persona = 'student' | 'alumniMentor' | 'departmentAdmin';
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

test('deneyim: yaz → moderasyon → yayın → okuyucu anonim yazarı görmez', async ({
  page,
  browser,
}) => {
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.experience.deleteMany({ where: { authorId: student.id } });
  const adminContext = await browser.newContext();
  const readerContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const reader = await readerContext.newPage();
  try {
    await login(page, 'student');
    await page.goto('/deneyim/yeni');
    await page.getByLabel(/Kurum ya da etkinlik adı/).fill('E2E Teknoloji A.Ş.');
    await page.getByLabel(/^Yıl/).fill('2025');
    await page.getByLabel(/^Dönem/).selectOption('SUMMER');
    await page.getByLabel(/Süre/).fill('8');
    await page.getByLabel(/^Ücret/).selectOption('PAID');
    await page.getByLabel(/Nasıl başvurdun/).selectOption('LINKEDIN_POST');
    await page.getByLabel(/Neler öğrendin/).fill('Takım içinde çalışmayı öğrendim.');
    await page.getByLabel(/Sonrakilere tavsiyen/).fill('Erken başvur.');
    await page.getByLabel('Anonim paylaş').check();
    await page.getByRole('button', { name: 'Moderasyona gönder' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Moderasyona gönder' }).click();
    await expect(
      page.getByRole('heading', { name: 'Deneyimin incelemeye gönderildi.' }),
    ).toBeVisible();
    const row = await db.experience.findFirstOrThrow({ where: { authorId: student.id } });
    expect(row).toMatchObject({ status: 'PENDING', isAnonymous: true });

    await login(admin, 'departmentAdmin');
    await admin.goto('/yonetim/deneyimler');
    await expect(admin.getByText('E2E Teknoloji A.Ş.', { exact: true }).first()).toBeVisible();
    await expect(admin.getByText('Yazar bilgisi moderasyonda gösterilmez.')).toBeVisible();
    await admin.getByRole('button', { name: 'Yayınla' }).first().click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Yayınla' }).click();
    await expect(admin.getByText('Deneyim yayınlandı.')).toBeVisible();
    expect((await db.experience.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PUBLISHED',
    );

    await page.goto('/deneyimlerim');
    await expect(page.getByText('Yayında', { exact: true }).first()).toBeVisible();

    await login(reader, 'alumniMentor');
    const responses: Promise<string>[] = [];
    reader.on('response', (response) => {
      const type = response.headers()['content-type'] ?? '';
      if (type.includes('text/') || type.includes('json')) {
        responses.push(response.text().catch(() => ''));
      }
    });
    const document = await reader.goto(`/deneyim/${row.id}`);
    const source = await document!.text();
    const flight = await reader.evaluate(async (id) => {
      const response = await fetch(`/deneyim/${id}`, { headers: { RSC: '1' } });
      return response.text();
    }, row.id);
    await expect(reader.getByRole('heading', { name: 'E2E Teknoloji A.Ş.' })).toBeVisible();
    await expect(reader.getByText('Anonim paylaşıldı')).toBeVisible();
    const html = await reader.content();
    for (const body of [html, source, flight, ...(await Promise.all(responses))]) {
      expect(body).not.toContain(student.name);
      expect(body).not.toContain(student.email);
      expect(body).not.toContain(student.id);
    }
    expect(
      await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await adminContext.close();
    await readerContext.close();
  }
});
