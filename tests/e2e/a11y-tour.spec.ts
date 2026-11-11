import { expect, test, type Page } from '@playwright/test';

import { luminanceOf, measurePage, tabThrough } from './a11y';
import { waitForHydratedForm } from './hydration';

// Faz 2 erişilebilirlik turu (P2-14): klavye, ekran okuyucu adları, kontrast ve taşma; her iki temada, telefon ve masaüstü genişliğinde.
// Ölçümler `tests/e2e/a11y.ts` içindedir (kütüphane yok). Bulgu çıkarsa sayfa düzeltilir; test gevşetilmez.
const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

const PUBLIC = ['/', '/giris'];
const STUDENT = [
  '/hesap',
  '/ilanlar',
  '/deneyimler',
  '/mentorlar',
  '/ders-rehberi',
  '/sirketler',
  '/mulakat-sorulari',
  '/basvuru-takvimi',
  '/etkinlikler',
  '/profil',
];
const ADMIN = ['/yonetim', '/yonetim/ilanlar', '/yonetim/etkinlikler'];
const SYSTEM_ADMIN = ['/yonetim/deneyimler', '/yonetim/ayin-mezunu'];
// Liste → ilk ayrıntı sayfası: ayrıntı ekranları da aynı kurallarla ölçülür.
const DETAILS = [{ list: '/etkinlikler', link: 'a[href^="/etkinlikler/"]' }];

async function login(page: Page, persona: 'student' | 'departmentAdmin' | 'systemAdmin') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  // Test girişi önce /hesap'a gidebilir; onay kapısını hedef sayfa sanıp ölçmemek için açıkça tamamla.
  await page.goto('/onay');
  await waitForHydratedForm(page, 'Seçimlerimi kaydet');
  const consent = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await consent.nth(0).check();
  await consent.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}

async function audit(page: Page, path: string, scheme: 'light' | 'dark') {
  await page.goto(path, { waitUntil: 'networkidle' });
  expect(new URL(page.url()).pathname, `${path}: hedef rota ölçülmeli`).toBe(
    new URL(path, page.url()).pathname,
  );
  await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  // İlk Tab durağı "İçeriğe geç": klavye kullanıcısı gezinmeyi atlayabilir.
  await page.keyboard.press('Tab');
  expect
    .soft(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      `${path} (${scheme}): ilk Tab durağı atlama bağlantısı`,
    )
    .toBe('İçeriğe geç');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const report = await measurePage(page);
  const where = `${path} (${scheme}, ${page.viewportSize()?.width}px)`;
  expect.soft(report.overflowX, `${where}: yatay taşma`).toBe(false);
  expect.soft(report.mains, `${where}: tek ana bölge`).toBe(1);
  expect.soft(report.h1s, `${where}: görünür h1 sayısı`).toBeGreaterThanOrEqual(1);
  expect.soft(report.unnamed, `${where}: adsız etkileşimli öğe`).toEqual([]);
  expect.soft(report.duplicateLinks, `${where}: aynı adlı farklı hedefli bağlantı`).toEqual([]);
  expect.soft(report.lowContrast, `${where}: AA altı metin`).toEqual([]);
  const luminance = luminanceOf(report.background);
  if (scheme === 'dark') expect(luminance, `${where}: koyu zemin`).toBeLessThan(0.08);
  else expect.soft(luminance, `${where}: açık (krem) zemin`).toBeGreaterThan(0.85);
  const keyboard = await tabThrough(page, 30);
  expect.soft(keyboard.problems, `${where}: klavye`).toEqual([]);
  expect.soft(keyboard.distinct, `${where}: odak bir yere sıkışmamalı`).toBeGreaterThanOrEqual(3);
}

for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    test.describe(`${scheme} tema, ${size.name}px`, () => {
      test.use({ colorScheme: scheme, viewport: { width: size.width, height: size.height } });

      test('girişsiz ekranlar', async ({ page }) => {
        test.setTimeout(120_000);
        for (const path of PUBLIC) await audit(page, path, scheme);
      });
      test('öğrenci ekranları', async ({ page }) => {
        test.setTimeout(240_000);
        await login(page, 'student');
        for (const path of STUDENT) await audit(page, path, scheme);
        for (const { list, link } of DETAILS) {
          await page.goto(list, { waitUntil: 'networkidle' });
          const href = await page.locator(link).first().getAttribute('href');
          expect(href, `${list}: ayrıntı bağlantısı`).toBeTruthy();
          await audit(page, href!, scheme);
        }
      });
      test('yönetici ekranları', async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'departmentAdmin');
        for (const path of ADMIN) await audit(page, path, scheme);
      });
      test('sistem yöneticisi ekranları', async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'systemAdmin');
        for (const path of SYSTEM_ADMIN) await audit(page, path, scheme);
      });
    });
  }
}
