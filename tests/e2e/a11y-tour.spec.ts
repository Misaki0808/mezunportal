import { loginAs } from './login';
import { expect, test, type Page } from './fixture';
import { tabForward } from './keyboard';

import { luminanceOf, measurePage, tabThrough } from './a11y';

// Faz 2 erişilebilirlik turu (P2-14): klavye, ekran okuyucu adları, kontrast ve taşma; her iki temada, telefon ve masaüstü genişliğinde.
// Ölçümler `tests/e2e/a11y.ts` içindedir (kütüphane yok). Bulgu çıkarsa sayfa düzeltilir; test gevşetilmez.
const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

const PUBLIC = ['/', '/giris'];
// Kabuk içi bütün Görünüm A rotaları persona başına (kart 465). Her liste ilgili persona'nın AÇABİLDİĞİ sayfalardır: rol uyarısı ya da
// yönlendirme çıkan sayfa ölçüm sayılmaz (audit bunu açık hata verir). Girişsiz/yalnız-bağlantılı sayfalar kapsam dışıdır (aşağıdaki not).
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
  '/bildirimler',
];
const STUDENT_MORE = [
  '/mezunlar',
  '/randevular',
  '/deneyimlerim',
  '/deneyim/yeni',
  '/baslangic',
  '/sss',
  '/hikayeler',
  '/hesap/ad-soyad',
  '/hesap/aylik-ozet',
  '/hesap/bildirimler',
  '/hesap/cv-inceleme',
  '/hesap/e-posta',
  '/hesap/gorusmeler',
  '/hesap/guvenilirlik',
  '/hesap/sss',
  '/hesap/staj-ariyorum',
  '/hesap/gizlilik',
  '/hesap/hesabi-sil',
  '/hesap/iletisim',
  '/hesap/referanslar',
  '/hesap/veriler',
  '/profil/cv',
  '/profil/fotograf',
];
const ALUMNI = [
  '/ilanlarim',
  '/ilanlar/yeni',
  '/mentor/ayarlar',
  '/mentor/sss',
  '/profil/dersler',
  '/hesap/hikayem',
  '/odullerim',
  '/adaylar',
  '/referans/yeni',
  '/deneyimlerim',
  '/mezunlar',
];
const ADMIN = ['/yonetim', '/yonetim/ilanlar', '/yonetim/etkinlikler'];
const ADMIN_MORE = [
  '/yonetim/aylik-ozet',
  '/yonetim/belge-kuyrugu',
  '/yonetim/dersler',
  '/yonetim/istihdam',
  '/yonetim/kullanicilar',
  '/yonetim/kullanim',
  '/yonetim/referanslar',
  '/yonetim/sikayetler',
  '/yonetim/sss',
  '/yonetim/yilin-mezunu',
];
const SYSTEM_ADMIN = ['/yonetim/deneyimler', '/yonetim/ayin-mezunu'];
const SYSTEM_ADMIN_MORE = [
  '/yonetim/google',
  '/yonetim/sozlukler/birlestir',
  '/yonetim/davetler',
  '/yonetim/eslesmeyenler',
  '/yonetim/puan',
  '/yonetim/sozlukler',
  '/yonetim/yetkiler',
  '/yonetim/islem-kaydi',
];
// Liste → ilk ayrıntı sayfası: ayrıntı ekranları da aynı kurallarla ölçülür. `optional`: liste boşsa ölçülmez (not düşer).
type Detail = { list: string; link: string; optional?: boolean };
const DETAILS: Detail[] = [{ list: '/etkinlikler', link: 'a[href^="/etkinlikler/"]' }];
const STUDENT_DETAILS: Detail[] = [
  { list: '/ilanlar', link: 'a[href^="/ilanlar/"]:not([href="/ilanlar/yeni"])' },
  { list: '/deneyimler', link: 'a[href^="/deneyim/"]:not([href="/deneyim/yeni"])' },
  { list: '/sirketler', link: 'a[href^="/sirketler/"]' },
  { list: '/mentorlar', link: 'a[href^="/randevu-al/"]' },
  { list: '/randevular', link: 'a[href^="/randevular/"]', optional: true },
  { list: '/sss', link: 'a[href^="/sss/"]', optional: true },
  { list: '/hikayeler', link: 'a[href^="/hikayeler/"]', optional: true },
];
const ADMIN_DETAILS: Detail[] = [
  { list: '/yonetim/kullanicilar', link: 'a[href^="/yonetim/kullanicilar/"]' },
  { list: '/yonetim/etkinlikler', link: 'a[href^="/yonetim/etkinlikler/"]', optional: true },
];

const login = loginAs;
const NOT_A_REAL_SCREEN =
  /Bu sayfa senin rolün için değil|Aradığın sayfa bulunamadı|Giriş yapman gerekiyor/;

/** Liste → ilk ayrıntı sayfası ölçümü. */
async function auditDetails(page: Page, details: Detail[], scheme: 'light' | 'dark') {
  for (const { list, link, optional } of details) {
    await page.goto(list, { waitUntil: 'networkidle' });
    const href = await page
      .locator(link)
      .first()
      .getAttribute('href', { timeout: 4000 })
      .catch(() => null);
    if (!href && optional) {
      test
        .info()
        .annotations.push({ type: 'not', description: `${list}: liste boş, ayrıntı ölçülemedi` });
      continue;
    }
    expect(href, `${list}: ayrıntı bağlantısı`).toBeTruthy();
    await audit(page, href!, scheme);
  }
}

async function audit(page: Page, path: string, scheme: 'light' | 'dark') {
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  expect(new URL(page.url()).pathname, `${path}: hedef rota ölçülmeli`).toBe(
    new URL(path, page.url()).pathname,
  );
  await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  // Rol uyarısı ya da 404 ekranını ölçmek sahte yeşildir: bu sayfa bu persona için ölçülecek gerçek ekran olmalı.
  const screenText = await page.locator('main, [role="main"]').first().innerText();
  expect
    .soft(screenText, `${path}: gerçek ekran (rol uyarısı/404 değil)`)
    .not.toMatch(NOT_A_REAL_SCREEN);
  expect.soft(response?.status(), `${path}: HTTP durumu`).toBeLessThan(400);
  // İlk Tab durağı "İçeriğe geç": klavye kullanıcısı gezinmeyi atlayabilir.
  await tabForward(page);
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
  else expect.soft(luminance, `${where}: açık (kâğıt) zemin`).toBeGreaterThan(0.85);
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
        await auditDetails(page, DETAILS, scheme);
      });
      test('öğrenci: kalan sayfalar (hesap, profil, mezunlar, randevular …)', async ({ page }) => {
        test.setTimeout(480_000);
        await login(page, 'student');
        for (const path of STUDENT_MORE) await audit(page, path, scheme);
      });
      test('öğrenci: ayrıntı ekranları', async ({ page }) => {
        test.setTimeout(300_000);
        await login(page, 'student');
        await auditDetails(page, STUDENT_DETAILS, scheme);
      });
      test('onay ekranı (rıza öncesi, akademisyen)', async ({ page }) => {
        test.setTimeout(120_000);
        // Bu persona başka testte onay vermez: ilk girişte /onay açılır ve rıza verilmeden ölçülür.
        await page.goto('/giris/test?persona=academic');
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
        await page.waitForURL(/\/onay/);
        await audit(page, '/onay', scheme);
      });
      test('mezun mentor ekranları', async ({ page }) => {
        test.setTimeout(300_000);
        await login(page, 'alumniMentor');
        for (const path of ALUMNI) await audit(page, path, scheme);
      });
      test('yönetici ekranları', async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'departmentAdmin');
        for (const path of ADMIN) await audit(page, path, scheme);
      });
      test('yönetici: kalan yönetim ekranları ve ayrıntılar', async ({ page }) => {
        test.setTimeout(480_000);
        await login(page, 'departmentAdmin');
        for (const path of ADMIN_MORE) await audit(page, path, scheme);
        await auditDetails(page, ADMIN_DETAILS, scheme);
      });
      test('sistem yöneticisi ekranları', async ({ page }) => {
        test.setTimeout(180_000);
        await login(page, 'systemAdmin');
        for (const path of [...SYSTEM_ADMIN, ...SYSTEM_ADMIN_MORE]) await audit(page, path, scheme);
      });
    });
  }
}
