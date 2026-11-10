import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client';
import { waitForHydratedForm } from './hydration';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

type Persona = 'student' | 'alumniMentor' | 'departmentAdmin';
async function login(page: Page, persona: Persona) {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await waitForHydratedForm(page, 'Seçimlerimi kaydet');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('ana sayfa oturumsuzken tanıtım ve giriş eylemini gösterir; "Çok yakında" yoktur', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Staj ararken yalnız değilsin/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'İÜ e-postanla başla' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Çok yakında')).toHaveCount(0);
});

test('ana sayfa rol bazlı pano: öğrenci ve mentor farklı kısayollar görür, taşma yok', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'student');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Merhaba, Deniz/ })).toBeVisible();
  const shortcuts = page.getByRole('region', { name: 'Kısayollar' });
  await expect(shortcuts.getByRole('link', { name: /Mentor bul/ })).toBeVisible();
  await expect(shortcuts.getByRole('link', { name: /CV incelemesi/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Yönetim/ })).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.context().clearCookies();

  await login(page, 'alumniMentor');
  await page.goto('/');
  const mentorShortcuts = page.getByRole('region', { name: 'Kısayollar' });
  await expect(mentorShortcuts.getByRole('link', { name: /CV incelemeleri/ })).toBeVisible();
  await expect(mentorShortcuts.getByRole('link', { name: /Mentor bul/ })).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('bölüm yöneticisi panosunda Yönetim satırı görünür; rol dışı sayfa durum ekranıyla panele döndürür', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await login(page, 'departmentAdmin');
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Yönetim/ })).toHaveAttribute('href', '/yonetim');
  await page.goto('/yonetim/sozlukler');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bu sayfa senin rolün için değil' }),
  ).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Bir sorun oluştu' })).toHaveCount(0);
  const back = page.getByRole('link', { name: 'Yönetim paneline dön' });
  await expect(back).toHaveAttribute('href', '/yonetim');
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('görüşme formu henüz açılmadı: durum başlığı ve tek eylem, alarm yok', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const start = Date.UTC(2090, 0, 1) + Math.floor(Math.random() * 300) * 86400000;
  const appointment = await db.appointment.create({
    data: {
      mentorId: mentor.id,
      menteeId: student.id,
      startsAt: new Date(start),
      endsAt: new Date(start + 3600000),
      expiresAt: new Date(start - 3600000),
      decidedAt: new Date(start - 7200000),
      mode: 'ONLINE',
      status: 'CONFIRMED',
    },
  });
  try {
    await login(page, 'student');
    await page.goto(`/hesap/gorusme/${appointment.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Form henüz açılmadı' }),
    ).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Bir sorun oluştu' })).toHaveCount(0);
    const link = page.getByRole('link', { name: 'Görüşmelerime dön' });
    await expect(link).toHaveAttribute('href', '/hesap/gorusmeler');
    await link.click();
    await expect(page).toHaveURL(/\/hesap\/gorusmeler$/);
  } finally {
    await db.appointment.delete({ where: { id: appointment.id } });
  }
});
