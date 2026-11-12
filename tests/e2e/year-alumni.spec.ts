import { loginAs } from './login';
import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

async function notFoundContent(page: Page, html: string) {
  return page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    // Next dev gövdeye istek kimliği, zamanlama ve yığın ekler; kullanıcıya sunulan içerik aynı kalır.
    document
      .querySelectorAll('script,style,template,nextjs-portal')
      .forEach((node) => node.remove());
    return { title: document.title, text: document.body.textContent?.replace(/\s+/g, ' ').trim() };
  }, html);
}

test('mezun yayın iznini açar, doğrulama sayfasını görür ve geri alır', async ({
  page,
  request,
}) => {
  // Altmış gerçek HTTP isteğiyle hız sınırını da doğrulayan bu akış, soğuk derlemede uzayabilir.
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const member = await db.membership.findFirstOrThrow({
    where: {
      role: 'ALUMNI',
      endedAt: null,
      user: { email: 'alumni-mentor@test.mezunportal.local' },
    },
    select: { userId: true, departmentId: true },
  });
  const cycle = await db.awardCycle.create({
    data: {
      departmentId: member.departmentId,
      year: 2097,
      ceremonyAt: new Date('2098-06-30T00:00:00Z'),
      frozenAt: new Date(),
    },
  });
  const award = await db.award.create({
    data: {
      cycleId: cycle.id,
      departmentId: member.departmentId,
      year: 2097,
      userId: member.userId,
      verificationCode: randomBytes(32).toString('base64url'),
    },
  });
  try {
    expect((await request.get(`/dogrula/${award.verificationCode}`)).status()).toBe(404);
    await loginAs(page, 'alumniMentor');
    await page.goto('/odullerim');
    const card = page
      .locator('div')
      .filter({ hasText: '2097 akademik yılı' })
      .filter({ has: page.getByRole('switch', { name: /Ödülümü herkese açık/ }) })
      .last();
    await expect(card).toBeVisible();
    await card.getByRole('switch', { name: /Ödülümü herkese açık/ }).check();
    await card.getByRole('button', { name: 'Kaydet' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tercihin kaydedildi.' }),
    ).toBeVisible();
    const response = await request.get(`/dogrula/${award.verificationCode}`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Ödül doğrulama');
    expect(body).not.toContain('alumni-mentor@test.mezunportal.local');
    const ip = `192.0.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
    for (let i = 0; i < 60; i++) {
      expect(
        (
          await request.get(`/dogrula/${award.verificationCode}`, {
            headers: { 'x-forwarded-for': ip },
          })
        ).status(),
      ).toBe(200);
    }
    const limited = await request.get(`/dogrula/${award.verificationCode}`, {
      headers: { 'x-forwarded-for': ip },
    });
    expect(limited.status()).toBe(404);
    const limitedBody = await limited.text();
    const unknownCode = randomBytes(32).toString('base64url');
    const unknown = await request.get(`/dogrula/${unknownCode}`, {
      headers: { 'x-forwarded-for': ip },
    });
    expect(unknown.status()).toBe(404);
    expect(await notFoundContent(page, await unknown.text())).toEqual(
      await notFoundContent(page, limitedBody),
    );
    await card.getByRole('switch', { name: /Ödülümü herkese açık/ }).uncheck();
    await card.getByRole('button', { name: 'Kaydet' }).click();
    await expect
      .poll(async () => (await request.get(`/dogrula/${award.verificationCode}`)).status())
      .toBe(404);
    const revokedLimited = await request.get(`/dogrula/${award.verificationCode}`, {
      headers: { 'x-forwarded-for': ip },
    });
    expect(revokedLimited.status()).toBe(404);
    expect(await notFoundContent(page, await revokedLimited.text())).toEqual(
      await notFoundContent(page, limitedBody),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await db.award.delete({ where: { id: award.id } });
    await db.awardCycle.delete({ where: { id: cycle.id } });
  }
});
