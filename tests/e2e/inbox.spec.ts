import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';

import { TEST_PERSONAS } from '../../prisma/seed-data';
import { PrismaClient } from '../../src/generated/prisma/client';
import messages from '../../messages/tr.json' with { type: 'json' };
import { loginAs } from './login';

/**
 * Uygulama içi bildirim kutusu (P2-05): gruplama, gün başlıkları, rozet, tek dokunuşla okundu, "hepsini okundu yap",
 * sayfalama, boş durum, taşma ve başkasının bildirimi. Kayıtlar veritabanına doğrudan yazılır; "ilan yayınlanınca rozet" akışı
 * `job-postings.spec.ts` içindedir. Her test kendi kullanıcısının kutusunu sıfırlar.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

const DAY = 86_400_000;
const at = (daysAgo: number, hour = 9) => {
  const base = new Date(Date.now() - daysAgo * DAY);
  base.setUTCHours(hour, 0, 0, 0);
  return base;
};

async function userId(persona: keyof typeof TEST_PERSONAS) {
  return (
    await db.user.findUniqueOrThrow({
      where: { email: TEST_PERSONAS[persona].email },
      select: { id: true },
    })
  ).id;
}
async function put(
  owner: string,
  rows: { kind: string; createdAt: Date; read?: boolean; refId?: string }[],
) {
  await db.inAppNotification.createMany({
    data: rows.map((row) => ({
      userId: owner,
      kind: row.kind,
      refId: row.refId ?? randomUUID(),
      key: randomUUID(),
      createdAt: row.createdAt,
      readAt: row.read ? row.createdAt : null,
    })),
  });
}
const reset = (owner: string) => db.inAppNotification.deleteMany({ where: { userId: owner } });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const bell = (page: Page, name: string | RegExp) =>
  page.getByRole('link', { name, exact: typeof name === 'string' });

test.describe('bildirim kutusu', () => {
  test('rozet → liste → satır: gruplama, gün başlıkları, tek dokunuşla okundu, hepsini okundu yap (390)', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const student = await userId('student');
    await reset(student);
    await put(student, [
      { kind: 'jobMatchPosting', createdAt: at(0, 7) },
      { kind: 'jobMatchPosting', createdAt: at(0, 8) },
      { kind: 'jobMatchPosting', createdAt: at(0, 9) },
      { kind: 'contact', createdAt: at(0, 10) },
      { kind: 'appointmentConfirmed', createdAt: at(1), read: true },
      { kind: 'appointmentConfirmed', createdAt: at(1, 11), read: true },
      { kind: 'faqPublished', createdAt: at(12), read: true },
    ]);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await loginAs(page, 'student');
      await page.goto('/ilanlar');
      // Rozet: 4 okunmamış (üç ilan eşleşmesi + bir iletişim talebi).
      await expect(bell(page, 'Bildirimler, 4 okunmamış')).toBeVisible();
      await bell(page, 'Bildirimler, 4 okunmamış').click();
      await page.waitForURL('**/bildirimler');
      await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible();

      // Gruplama: aynı gün üç ilan tek satır; dün iki randevu tek satır; günler başlıkla ayrılır.
      const jobs = page.getByRole('link', { name: /Profiline uyan 3 yeni ilan var\./ });
      await expect(jobs).toHaveCount(1);
      await expect(jobs).toHaveAttribute('href', '/ilanlar');
      await expect(page.getByRole('link', { name: /2 randevun onaylandı\./ })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 2, name: 'Bugün' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Dün' })).toBeVisible();
      await expect(page.locator('main li')).toHaveCount(4);
      expect(await noOverflow(page)).toBe(true);
      // Okunmamışlar metinle belli: ilan satırı ve iletişim satırı; okunmuş satırlarda yok.
      await expect(page.getByText('Okunmadı')).toHaveCount(2);

      // İletişim satırına dokun: ilgili sayfaya gider, bildirim okundu olur, rozet 3'e düşer (sayfa yenilemeden).
      await page.getByRole('link', { name: /Sana bir iletişim talebi geldi\./ }).click();
      await page.waitForURL('**/hesap/iletisim');
      await expect(bell(page, 'Bildirimler, 3 okunmamış')).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible();

      // Hepsini okundu yap: toast, rozet söner, düğme pasifleşir ve sebebini söyler.
      await page.getByRole('button', { name: 'Hepsini okundu yap' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: messages.inbox.markAllDone }),
      ).toBeVisible();
      await expect(page.getByText('Okunmadı')).toHaveCount(0);
      await expect(bell(page, 'Bildirimler')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hepsini okundu yap' })).toBeDisabled();
      expect(await db.inAppNotification.count({ where: { userId: student, readAt: null } })).toBe(
        0,
      );
    } finally {
      await context.close();
    }
  });

  test('masaüstü (1440): yan menüde rozetli giriş, klavyeyle satıra gidilir, taşma yok', async ({
    browser,
  }) => {
    const student = await userId('student');
    await reset(student);
    await put(student, [
      { kind: 'jobMatchPosting', createdAt: at(0, 9), refId: 'p-klavye' },
      { kind: 'appointmentReminder', createdAt: at(0, 10), refId: 'a-1', read: true },
    ]);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await loginAs(page, 'student');
      await page.goto('/bildirimler');
      const side = page.getByRole('navigation', { name: 'Yan menü' });
      const entry = side.getByRole('link', { name: /Bildirimler/ });
      await expect(entry).toHaveAttribute('aria-current', 'page');
      await expect(entry).toHaveAccessibleName('Bildirimler, 1 okunmamış');
      expect(await noOverflow(page)).toBe(true);
      // Satır bir bağlantıdır: odaklanır ve Enter ile gidilir.
      const row = page.getByRole('link', { name: /Profiline uyan yeni bir ilan var\./ });
      await row.focus();
      await expect(row).toBeFocused();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/ilanlar/p-klavye');
    } finally {
      await context.close();
    }
  });

  test('uzun kutu: günler bölünmeden sayfalanır, "Daha eski bildirimler" eski günleri ekler (390)', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const student = await userId('student');
    await reset(student);
    // 60 + 60 + 5 kayıt: ilk sayfa en yeni günü bütün alır, yarım kalacak en eski gün sonraki sayfaya kalır.
    await put(
      student,
      Array.from({ length: 60 }, () => ({ kind: 'contact', createdAt: at(3), read: true })),
    );
    await put(
      student,
      Array.from({ length: 60 }, () => ({ kind: 'contact', createdAt: at(4), read: true })),
    );
    await put(
      student,
      Array.from({ length: 5 }, () => ({ kind: 'faqPublished', createdAt: at(5), read: true })),
    );
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await loginAs(page, 'student');
      await page.goto('/bildirimler');
      await expect(page.getByRole('link', { name: /60 iletişim talebi geldi\./ })).toHaveCount(1);
      const more = page.getByRole('button', { name: 'Daha eski bildirimler' });
      await expect(more).toBeVisible();
      await more.click();
      // İkinci sayfa: aynı türden 60'lık grup bölünmeden gelir; en eski gün de eklenir; düğme kalkar.
      await expect(page.getByRole('link', { name: /60 iletişim talebi geldi\./ })).toHaveCount(2);
      await expect(page.getByRole('link', { name: /5 sorun yayınlandı\./ })).toHaveCount(1);
      await expect(more).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('boş kutu sıcak bir boş durum verir; başkasının bildirimi görünmez', async ({ browser }) => {
    const [student, alumni] = await Promise.all([userId('student'), userId('alumniMentor')]);
    await reset(student);
    await reset(alumni);
    await put(alumni, [{ kind: 'contact', createdAt: at(0, 9) }]);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await loginAs(page, 'student');
      await page.goto('/bildirimler');
      await expect(page.getByRole('heading', { name: 'Henüz bildirimin yok' })).toBeVisible();
      await expect(page.getByText(/iletişim talebi/)).toHaveCount(0);
      await expect(bell(page, 'Bildirimler')).toBeVisible();
      await page.getByRole('link', { name: 'İlanlara göz at' }).click();
      await page.waitForURL('**/ilanlar');
    } finally {
      await context.close();
      await reset(alumni);
    }
  });

  test('oturumsuz kullanıcı bildirim kutusunu göremez; rozet rotası 401 verir', async ({
    page,
    request,
  }) => {
    expect((await request.get('/api/bildirimler/okunmamis')).status()).toBe(401);
    await page.goto('/bildirimler');
    await expect(page).not.toHaveURL(/\/bildirimler$/);
    await expect(page.getByRole('heading', { name: 'Bildirimler', level: 1 })).toHaveCount(0);
  });
});

test('201 bildirimli grup tek dokunuşta bütünüyle okundu olur (390)', async ({ browser }) => {
  const student = await userId('student');
  await reset(student);
  await put(
    student,
    Array.from({ length: 201 }, () => ({ kind: 'contact', createdAt: at(0, 9) })),
  );
  await put(student, [{ kind: 'faqPublished', createdAt: at(0, 10) }]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await loginAs(page, 'student');
    await page.goto('/bildirimler');
    await page.getByRole('link', { name: /201 iletişim talebi geldi/ }).click();
    await page.waitForURL('**/hesap/iletisim');
    await expect
      .poll(() =>
        db.inAppNotification.count({ where: { userId: student, kind: 'contact', readAt: null } }),
      )
      .toBe(0);
    await expect(bell(page, 'Bildirimler, 1 okunmamış')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Hepsini okundu yap' })).toBeEnabled();
    await page.getByRole('button', { name: 'Hepsini okundu yap' }).click();
    await expect
      .poll(() => db.inAppNotification.count({ where: { userId: student, readAt: null } }))
      .toBe(0);
    await expect(bell(page, 'Bildirimler')).toBeVisible();
  } finally {
    await context.close();
    await reset(student);
  }
});

test('inceleme: 390/1440 açık-koyu dolu ve boş bildirim kutusu', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const student = await userId('student');
  for (const width of [390, 1440])
    for (const colorScheme of ['light', 'dark'] as const) {
      await reset(student);
      await put(student, [
        ...Array.from({ length: 3 }, () => ({ kind: 'jobMatchPosting', createdAt: at(0, 9) })),
        { kind: 'contact', createdAt: at(0, 10) },
        { kind: 'appointmentConfirmed', createdAt: at(1, 9), read: true },
      ]);
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const page = await context.newPage();
      try {
        await loginAs(page, 'student');
        await page.goto('/bildirimler');
        await expect(page.getByRole('link', { name: /Profiline uyan 3 yeni ilan/ })).toBeVisible();
        await expect(bell(page, 'Bildirimler, 4 okunmamış')).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`dolu-${width}-${colorScheme}.png`),
          fullPage: true,
        });
        await reset(student);
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Henüz bildirimin yok' })).toBeVisible();
        await expect(bell(page, 'Bildirimler')).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`bos-${width}-${colorScheme}.png`),
          fullPage: true,
        });
      } finally {
        await context.close();
        await reset(student);
      }
    }
});
