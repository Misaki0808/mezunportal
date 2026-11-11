import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
const login = loginAs;
test('CV talebi → yorum → faydalı; kapalı dosya erişimi 403', async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const id = randomUUID(),
    key = `cv/${student.id}/${id}.pdf`,
    file = path.resolve(process.env.STORAGE_LOCAL_PATH!, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '%PDF-1.4\n%%EOF');
  const cv = await db.cvUpload.create({
    data: {
      userId: student.id,
      storageKey: key,
      byteSize: 16,
      pageCount: 1,
      status: 'APPLIED',
      appliedAt: new Date(),
    },
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    mentorPage = await context.newPage();
  try {
    await db.cvReviewRequest.deleteMany({ where: { studentId: student.id, mentorId: mentor.id } });
    await db.mentorProfile.update({
      where: { userId: mentor.id },
      data: { cvReviewEnabled: true, cvReviewMonthlyLimit: 10 },
    });
    await login(page, 'student');
    await login(mentorPage, 'alumniMentor');
    await page.goto(`/uye/${mentor.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'CV incelemesi iste' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Mentora notun').fill('Staj başvurum için görüşünü alabilir miyim?');
    await page.getByRole('button', { name: 'Talep gönder' }).click();
    await expect(page.getByText('Talebin gönderildi.')).toBeVisible();
    const request = await db.cvReviewRequest.findFirstOrThrow({
      where: { studentId: student.id, mentorId: mentor.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    expect((await mentorPage.request.get(`/api/cv-inceleme/${request.id}/dosya`)).status()).toBe(
      200,
    );
    expect((await page.request.get(`/api/cv-inceleme/${request.id}/dosya`)).status()).toBe(403);
    await mentorPage.goto('/hesap/cv-inceleme');
    await mentorPage.waitForLoadState('networkidle');
    await mentorPage.getByLabel('Yazılı yorumun').fill('Projelerini daha belirgin anlatabilirsin.');
    await mentorPage.getByRole('button', { name: 'Yorumu gönder' }).click();
    await expect(mentorPage.getByText('Yorum gönderildi.')).toBeVisible();
    expect((await mentorPage.request.get(`/api/cv-inceleme/${request.id}/dosya`)).status()).toBe(
      403,
    );
    // 403, depodaki dosyanın fiziksel olarak silinmesine bağlı değildir.
    await access(file);
    const expired = await db.cvReviewRequest.create({
      data: {
        studentId: student.id,
        mentorId: mentor.id,
        cvUploadId: cv.id,
        note: 'Sentetik süre sınaması',
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 1),
      },
    });
    expect((await mentorPage.request.get(`/api/cv-inceleme/${expired.id}/dosya`)).status()).toBe(
      403,
    );
    await access(file);
    await db.cvReviewRequest.delete({ where: { id: expired.id } });
    await page.goto('/hesap/cv-inceleme');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Projelerini daha belirgin anlatabilirsin.')).toBeVisible();
    await page.getByRole('button', { name: 'Faydalı buldum' }).click();
    await expect(page.getByText('Faydalı olarak işaretlendi.').first()).toBeVisible();
  } finally {
    await context.close();
    await db.cvReviewRequest.deleteMany({ where: { cvUploadId: cv.id } });
    await db.cvUpload.delete({ where: { id: cv.id } });
    await rm(file, { force: true });
  }
});
