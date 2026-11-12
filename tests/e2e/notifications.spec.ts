import { loginAs } from './login';
import { createHmac, randomUUID } from 'node:crypto';
import { expect, test } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test('tercih kaydedilir ve imzalı yanıt yalnız bir kez işlenir', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const position = await db.position.create({
    data: {
      userId: user.id,
      companyRaw: 'Örnek Kurum',
      titleRaw: 'Uzman',
      source: 'MANUAL',
      isCurrent: true,
    },
  });
  const action = await db.notificationAction.create({
    data: {
      userId: user.id,
      positionId: position.id,
      cycle: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const secret = process.env.BETTER_AUTH_SECRET!;
  const signature = createHmac('sha256', secret)
    .update(`still-there:v1:${action.id}:YES`)
    .digest('base64url');
  const fragment = new URLSearchParams({
    token: `${action.id}.${signature}`,
    choice: 'YES',
  }).toString();
  try {
    await loginAs(page, 'student');
    await page.goto('/hesap/bildirimler');
    const optional = page.getByRole('switch', { name: /İletişim talepleri/ });
    const security = page.getByRole('switch', { name: /Hesap ve güvenlik/ });
    await expect(security).toBeDisabled();
    await optional.uncheck();
    await page.getByRole('button', { name: 'Tercihleri kaydet' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Bildirim tercihlerin kaydedildi.' }),
    ).toBeVisible();
    await page.reload();
    await expect(optional).not.toBeChecked();
    await page.goto(`/bildirim-yanit#${fragment}`);
    await page.getByRole('button', { name: 'Evet, hâlâ çalışıyorum' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'yanıtın kaydedildi' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await db.notificationAction.findUniqueOrThrow({ where: { id: action.id } })).choice,
      )
      .toBe('YES');
    await page.goto(`/bildirim-yanit#${fragment}`);
    await page.reload();
    await page.getByRole('button', { name: 'Evet, hâlâ çalışıyorum' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'geçersiz' })).toBeVisible();
  } finally {
    await db.notificationPreference.deleteMany({
      where: { userId: user.id, type: 'CONTACT_REQUEST' },
    });
    await db.position.delete({ where: { id: position.id } });
  }
});
