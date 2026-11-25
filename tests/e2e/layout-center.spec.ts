import { expect, test, type Page } from './fixture';
import { loginAs } from './login';

// Kullanıcı testi (25 Kas, kart 561): masaüstünde içerik yan menünün sağındaki alanda ORTALANMALI; "her sayfada sağ taraf bomboş" olmamalı.
// Ölçüm tarayıcıdadır: `.app-content`'in her doğrudan çocuğunda ana alana göre sol ve sağ boşluk yaklaşık eşit olmalı (dar sayfa kökleri ortada,
// geniş liste sayfaları dolu). Başlangıç adımları ve onay ekranında sabit alt çubuk yok, Geri/ana düğme orantılı.
const SIDE_TOLERANCE = 2;

async function measure(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main#main-content')!.getBoundingClientRect();
    const wrap = document.querySelector('.app-content')!;
    return [...wrap.children]
      .map((child) => ({ child, rect: child.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 1)
      .map(({ child, rect }) => ({
        name: `${child.tagName.toLowerCase()}.${String(child.className).split(' ').slice(0, 2).join('.')}`,
        left: Math.round(rect.left - main.left),
        right: Math.round(main.right - rect.right),
        width: Math.round(rect.width),
      }));
  });
}

test.describe('masaüstü 1440: içerik ortalanır', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('öğrenci sayfaları: sol ve sağ boşluk eşit', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, 'student');
    await page.goto('/mentorlar', { waitUntil: 'networkidle' });
    const mentor = await page.locator('a[href^="/randevu-al/"]').first().getAttribute('href');
    const routes = [
      '/bildirimler',
      '/profil',
      '/hesap',
      '/hesap/gizlilik',
      '/ilanlar',
      '/mezunlar',
      '/sirketler',
      '/mentorlar',
      '/randevular',
      '/deneyim/yeni',
      '/baslangic',
      ...(mentor ? [mentor] : []),
    ];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const children = await measure(page);
      expect(children.length, `${route}: içerik kabında çocuk var`).toBeGreaterThan(0);
      for (const child of children)
        expect(
          Math.abs(child.left - child.right),
          `${route}: ${child.name} sol ${child.left} / sağ ${child.right} px (genişlik ${child.width})`,
        ).toBeLessThanOrEqual(SIDE_TOLERANCE);
    }
  });

  test('onay ekranı (rıza öncesi) ortalanır', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/giris/test?persona=academic');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/onay/);
    await page.waitForLoadState('networkidle');
    for (const child of await measure(page))
      expect(Math.abs(child.left - child.right), `/onay: ${child.name}`).toBeLessThanOrEqual(
        SIDE_TOLERANCE,
      );
  });
});

test.describe('sabit alt çubuk yok, düğme oranı', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('başlangıç adımları: çubuk akışta, Geri dar, ana düğme aynı yükseklikte', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'student');
    // Sahte servisli rota (`onboarding-ui` gibi): ortak öğrencinin başlangıç ilerlemesini değiştirmez; ana sayfa taşma testleri
    // aynı hesabın tamamlanma yüzdesine bakar (gerçek adımlarda ilerlemek %100 "tamam" etiketini 320 px'te taşırıyordu).
    for (const step of ['GOALS', 'VISIBILITY', 'COMPLETE']) {
      await page.goto(`/baslangic/test?step=${step}`, { waitUntil: 'networkidle' });
      await expect(page.locator('[data-action-bar-frame]'), `${step}: sabit çubuk yok`).toHaveCount(
        0,
      );
      const back = page.getByRole('button', { name: 'Geri', exact: true });
      await expect(back, `${step}: Geri var`).toBeVisible();
      const main = back
        .locator('xpath=following-sibling::div[1]//*[self::button or self::a]')
        .first();
      const [backBox, mainBox] = await Promise.all([back.boundingBox(), main.boundingBox()]);
      expect(
        Math.abs(backBox!.height - mainBox!.height),
        `${step}: Geri ve ana düğme aynı yükseklikte`,
      ).toBeLessThanOrEqual(1);
      expect(backBox!.width, `${step}: Geri dar, ana düğme geniş`).toBeLessThan(mainBox!.width / 2);
      // Düğmeler akıştadır: sayfa kaydırılınca birlikte hareket eder (sabit olsaydı yerinde kalırdı).
      const scrollable = await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight + 40,
      );
      if (scrollable) {
        const before = (await main.boundingBox())!.y;
        await page.evaluate(() => window.scrollBy(0, 40));
        expect((await main.boundingBox())!.y, `${step}: kaydırınca hareket eder`).toBeLessThan(
          before,
        );
      }
    }
  });

  test('onay ekranı: kaydet listenin sonunda, sabit çubuk yok', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/giris/test?persona=academic');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
    await page.waitForURL(/\/onay/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-action-bar-frame]')).toHaveCount(0);
    const save = page.getByRole('button', { name: 'Seçimlerimi kaydet' });
    expect(await save.evaluate((node) => getComputedStyle(node.parentElement!).position)).not.toBe(
      'fixed',
    );
    const last = page.locator('main h2').last();
    const [saveBox, lastBox] = await Promise.all([save.boundingBox(), last.boundingBox()]);
    expect(saveBox!.y, 'kaydet son metnin altında').toBeGreaterThan(lastBox!.y);
  });
});
