import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { expect, test } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { decodeQR } from 'qr/decode.js';
import { PrismaClient } from '../../src/generated/prisma/client';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test('bozuk QR bağlantısı sayfa dışına yönlendirmez', async ({ page }) => {
  await page.goto('/etkinlik-katilim#etkinlik=evil.example&kod=123456');
  await expect(
    page.getByRole('status').filter({ hasText: 'Bu bağlantı geçerli değil' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/etkinlik-katilim$/);
});
test('390 px QR okutulur; öğrenci kayıt olur ve kodla katılımını doğrular', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
    include: { memberships: true },
  });
  const dept = user.memberships.find(
    (m) => m.role === 'STUDENT' && m.endedAt === null && m.verificationStatus === 'VERIFIED',
  )!.departmentId;
  const now = new Date();
  const eventTitle = `Örnek etkinlik ${randomUUID().slice(0, 8)}`;
  const event = await db.campusEvent.create({
    data: {
      title: eventTitle,
      description: 'Öğrenciler için örnek etkinlik',
      location: 'Kampüs',
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 3600_000),
      capacity: 10,
      status: 'PUBLISHED',
      createdById: user.id,
      reviewedById: user.id,
      reviewedAt: now,
      departments: { create: { departmentId: dept } },
    },
  });
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const admin = await adminContext.newPage();
    await loginAs(admin, 'departmentAdmin');
    await admin.goto(`/yonetim/etkinlikler/${event.id}`);
    const qr = admin.getByRole('img', { name: 'Etkinlik katılım bağlantısının QR kodu' });
    await expect(qr).toBeVisible();
    const remainingText = await admin.getByText(/Kodun yenilenmesine/).innerText();
    const remaining = Number(remainingText.match(/\d+/)?.[0]);
    if (remaining < 20) await admin.waitForTimeout((remaining + 6) * 1000);
    const pixels = await qr.evaluate((element) => {
      const img = element as HTMLImageElement,
        rect = img.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
      };
    });
    expect(pixels.width).toBeGreaterThanOrEqual(240);
    const qrUrl = new URL(decodeQR({ ...pixels, data: Uint8ClampedArray.from(pixels.data) }));
    expect(qrUrl.pathname).toBe('/etkinlik-katilim');
    expect(qrUrl.search).toBe('');
    const fragment = new URLSearchParams(qrUrl.hash.slice(1));
    expect(fragment.get('etkinlik')).toBe(event.id);
    const qrCode = fragment.get('kod')!;
    expect(qrCode).toMatch(/^\d{6}$/);
    await page.goto(qrUrl.href);
    await page.waitForURL(/\/giris/);
    await loginAs(page, 'student');
    await page.goto(`/etkinlikler/${event.id}`);
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible();
    await page.getByRole('button', { name: 'Katılıyorum' }).click();
    await expect(page.getByLabel('Altı haneli katılım kodu')).toBeVisible();
    await expect(page.getByLabel('Altı haneli katılım kodu')).toHaveValue(qrCode);
    await page.getByRole('button', { name: 'Katılımı doğrula' }).click();
    await expect(page.getByText('Katılımın doğrulandı.').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await admin.goto('/yonetim/etkinlikler');
    await admin.waitForLoadState('networkidle');
    const row = admin.locator('li').filter({ hasText: eventTitle });
    await expect(
      row.getByRole('button', { name: 'Etkinliği iptal et', exact: true }),
    ).toBeEnabled();
    await row.getByRole('button', { name: 'Etkinliği iptal et', exact: true }).click();
    await expect(admin.getByRole('dialog')).toBeVisible();
    await admin.getByRole('dialog').getByLabel('İşlem gerekçesi').fill('Etkinlik iptal denemesi');
    expect((await db.campusEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'PUBLISHED',
    );
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Etkinliği iptal et', exact: true })
      .click();
    await expect(row.getByText('İptal edildi', { exact: true })).toBeVisible();
  } finally {
    await adminContext.close();
    await db.pointEntry.deleteMany({
      where: { userId: user.id, sourceType: 'CAMPUS_EVENT', sourceId: event.id },
    });
    await db.campusEvent.delete({ where: { id: event.id } });
  }
});
