import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('mezun yayın iznini açar, doğrulama sayfasını görür ve geri alır', async ({
  page,
  request,
}) => {
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
    await page.goto('/giris/test?persona=alumniMentor');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/(hesap|onay)$/);
    await page.goto('/onay');
    const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
    await required.nth(0).check();
    await required.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await page.goto('/odullerim');
    const card = page
      .locator('section,article,div')
      .filter({ hasText: '2097 akademik yılı' })
      .last();
    await expect(card).toBeVisible();
    await page.getByRole('switch', { name: /Ödülümü herkese açık/ }).check();
    await page.getByRole('button', { name: 'Kaydet' }).click();
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
    expect(
      (
        await request.get(`/dogrula/${award.verificationCode}`, {
          headers: { 'x-forwarded-for': ip },
        })
      ).status(),
    ).toBe(404);
    await page.getByRole('switch', { name: /Ödülümü herkese açık/ }).uncheck();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect
      .poll(async () => (await request.get(`/dogrula/${award.verificationCode}`)).status())
      .toBe(404);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await db.award.delete({ where: { id: award.id } });
    await db.awardCycle.delete({ where: { id: cycle.id } });
  }
});
