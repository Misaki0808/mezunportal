import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });

test('mezun: iletişim kararı sonrası odak, bağlama uygun ret, açık mentor kayıtları ve nötr boş ödül', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const requesters = await db.user.findMany({
    where: {
      email: { in: ['student@test.mezunportal.local', 'senior-mentor@test.mezunportal.local'] },
    },
    orderBy: { id: 'asc' },
  });
  expect(requesters).toHaveLength(2);
  await db.contactRequest.deleteMany({ where: { targetId: mentor.id } });
  const ids = [randomUUID(), randomUUID()];
  await db.contactRequest.createMany({
    data: requesters.map((requester, index) => ({
      id: ids[index]!,
      requesterId: requester.id,
      targetId: mentor.id,
      fields: ['EMAIL'],
      createdAt: new Date(Date.now() - index * 1000),
    })),
  });
  try {
    await loginAs(page, 'alumniMentor');
    await page.goto('/hesap/iletisim');
    await page.locator('[data-hydrated="true"]').waitFor();
    await page.getByRole('button', { name: 'Onayla', exact: true }).first().click();
    const remaining = page.getByRole('button', { name: 'Onayla', exact: true });
    await expect(remaining).toHaveCount(1);
    await expect(remaining).toBeFocused();
    await page.getByRole('button', { name: 'Reddet', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Talebi reddet', exact: true })).toBeVisible();
    await expect(dialog.getByText(/Paylaşımı kapat/)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Reddet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'İletişim taleplerin', exact: true }),
    ).toBeFocused();
    expect(await db.contactRequest.count({ where: { id: { in: ids }, status: 'PENDING' } })).toBe(
      0,
    );
    await page.goto('/mentor/ayarlar');
    await page.waitForLoadState('networkidle');
    for (const label of [
      'Genel ayarları kaydet',
      'Ara verme durumunu kaydet',
      'Haftalık saatleri kaydet',
    ]) {
      const button = page.getByRole('button', { name: label, exact: true });
      await expect(button).toHaveClass(/bg-primary/);
      await button.click();
      await expect(button).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.getByText('Kaydedildi.', { exact: true })).toBeVisible();
    }
    await page.goto('/odullerim');
    await expect(page.getByRole('heading', { name: 'Ödüllerin', exact: true })).toBeVisible();
    await expect(page.getByText('Henüz bir ödülün yok.', { exact: true })).toBeVisible();
    await expect(page.getByText('Katkınla ilham verdin', { exact: true })).toHaveCount(0);
  } finally {
    await db.contactRequest.deleteMany({ where: { id: { in: ids } } });
  }
});

test('akademisyen: mentor ayarı yokken CV kutusu tek kurulum eylemi sunar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const academic = await db.user.findUniqueOrThrow({
    where: { email: 'academic@test.mezunportal.local' },
  });
  const previous = await db.mentorProfile.findUnique({ where: { userId: academic.id } });
  await db.mentorProfile.deleteMany({ where: { userId: academic.id } });
  try {
    await loginAs(page, 'academic');
    await page.goto('/hesap/cv-inceleme');
    await expect(
      page.getByRole('heading', { name: 'CV incelemelerine hazırlan', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Mentor ayarlarını aç', exact: true }).click();
    await expect(page).toHaveURL(/\/mentor\/ayarlar$/);
    await expect(
      page.getByRole('button', { name: 'Genel ayarları kaydet', exact: true }),
    ).toBeVisible();
  } finally {
    if (previous) await db.mentorProfile.create({ data: previous });
  }
});
