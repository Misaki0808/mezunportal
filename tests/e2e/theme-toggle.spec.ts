import { loginAs } from './login';
import { expect, test, type Page } from './fixture';

// Kart 383: tema düğmesi. Üç durum (Sistem / Açık / Koyu), çerezde kalıcı, ilk açılışta yanıp sönme yok.
const DARK = 'rgb(14, 26, 56)';
const LIGHT = 'rgb(255, 250, 244)';

const attr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
// Elle değişimde renkler 180 ms'lik kısa geçişle değişir: ölçüm geçiş bitene kadar yoklanır (anlık okuma ara rengi görür).
const expectBg = (page: Page, color: string) => expect.poll(() => bodyBg(page)).toBe(color);
const themeCookie = async (page: Page) =>
  (await page.context().cookies()).find((cookie) => cookie.name === 'theme');

test.describe('betik kapalıyken sunucu çerezden doğru temayı yazar (yanıp sönme yok)', () => {
  test.use({ javaScriptEnabled: false });

  for (const [cookie, system, expected] of [
    ['dark', 'light', DARK],
    ['light', 'dark', LIGHT],
    ['system', 'dark', DARK],
    ['system', 'light', LIGHT],
    ['bozuk-deger', 'dark', DARK],
    ['bozuk-deger', 'light', LIGHT],
  ] as const) {
    test(`çerez ${cookie}, sistem ${system}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ colorScheme: system, javaScriptEnabled: false });
      await context.addCookies([{ name: 'theme', value: cookie, url: baseURL! }]);
      const page = await context.newPage();
      await page.goto('/giris');
      expect(await bodyBg(page)).toBe(expected);
      const value = await attr(page);
      expect(value).toBe(['dark', 'light', 'system'].includes(cookie) ? cookie : 'system');
      await context.close();
    });
  }
});

test.describe('ilk boyamada tema değişmez', () => {
  test.use({ colorScheme: 'light' });

  test('koyu çerez açık sistemde ilk karede koyudur, sonra da değişmez', async ({
    context,
    page,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'theme', value: 'dark', url: baseURL! }]);
    await page.addInitScript(() => {
      const w = window as unknown as { __durumlar: string[]; __kareler: number };
      w.__durumlar = [];
      w.__kareler = 0;
      const loop = () => {
        const root = document.documentElement;
        if (root && document.body) {
          w.__kareler += 1;
          const state = `${root.getAttribute('data-theme')}|${getComputedStyle(document.body).backgroundColor}`;
          if (w.__durumlar[w.__durumlar.length - 1] !== state) w.__durumlar.push(state);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.goto('/giris', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const seen = await page.evaluate(() => {
      const w = window as unknown as { __durumlar: string[]; __kareler: number };
      return { states: w.__durumlar, frames: w.__kareler };
    });
    expect(seen.frames).toBeGreaterThan(5);
    expect(seen.states).toEqual([`dark|${DARK}`]);
  });
});

test.describe('düğme ve hesap seçimi (390 px, giriş yapmış öğrenci)', () => {
  test.use({ colorScheme: 'light', viewport: { width: 390, height: 844 } });

  test('üst çubuk düğmesi Açık ↔ Koyu; yenilemede ve sayfalar arasında kalıcı; çerez 1 yıl', async ({
    page,
  }) => {
    await loginAs(page, 'student');
    await page.goto('/hesap');
    await page.waitForLoadState('networkidle');
    expect(await attr(page)).toBe('system');
    const toggle = page.getByRole('button', { name: 'Koyu temaya geç' });
    const box = await toggle.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Açık temaya geç' })).toBeVisible();
    expect(await attr(page)).toBe('dark');
    await expectBg(page, DARK);
    const cookie = await themeCookie(page);
    expect(cookie).toMatchObject({ value: 'dark', httpOnly: false, sameSite: 'Lax' });
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 360 * 24 * 3600);

    await page.reload({ waitUntil: 'networkidle' });
    expect(await attr(page)).toBe('dark');
    await expectBg(page, DARK);
    for (const route of ['/mentorlar', '/ilanlar', '/randevular']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      expect(await attr(page), route).toBe('dark');
    }
    await page.getByRole('button', { name: 'Açık temaya geç' }).click();
    await expect.poll(() => attr(page)).toBe('light');
    await expectBg(page, LIGHT);
    expect((await themeCookie(page))?.value).toBe('light');
  });

  test('/hesap altında Sistem / Açık / Koyu üçlü seçimi; seçili olan aria-pressed ve ekranla uyumlu', async ({
    page,
  }) => {
    await loginAs(page, 'student');
    await page.goto('/hesap');
    await page.waitForLoadState('networkidle');
    const group = page.getByRole('group', { name: 'GÖRÜNÜM' });
    const option = (name: string) => group.getByRole('button', { name, exact: true });
    await expect(option('Sistem')).toHaveAttribute('aria-pressed', 'true');
    await option('Koyu').click();
    await expect(option('Koyu')).toHaveAttribute('aria-pressed', 'true');
    await expect(option('Sistem')).toHaveAttribute('aria-pressed', 'false');
    await expectBg(page, DARK);
    // Üst çubuk düğmesi ile seçim aynı kaynaktan beslenir.
    await expect(page.getByRole('button', { name: 'Açık temaya geç' })).toBeVisible();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(option('Koyu')).toHaveAttribute('aria-pressed', 'true');
    await option('Açık').click();
    await expect(option('Açık')).toHaveAttribute('aria-pressed', 'true');
    await expectBg(page, LIGHT);
    for (const name of ['Sistem', 'Açık', 'Koyu']) {
      const box = await option(name).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    // Sisteme dönünce cihaz ayarı (burada açık) geçerlidir; çerez 'system'.
    await option('Sistem').click();
    await expect(option('Sistem')).toHaveAttribute('aria-pressed', 'true');
    expect((await themeCookie(page))?.value).toBe('system');
    expect(await attr(page)).toBe('system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectBg(page, DARK);
  });
});

test.describe('geniş ekran (1440 px)', () => {
  test.use({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });

  test('yan menüdeki düğme çalışır; üst çubuktaki gizli kopya erişilebilirlik ağacında yok', async ({
    page,
  }) => {
    await loginAs(page, 'student');
    await page.goto('/mentorlar', { waitUntil: 'networkidle' });
    const toggles = page.getByRole('button', { name: 'Koyu temaya geç' });
    await expect(toggles).toHaveCount(1);
    await toggles.click();
    await expect.poll(() => attr(page)).toBe('dark');
    await expectBg(page, DARK);
  });
});

test.describe('giriş yapmamış sayfalar (390 px)', () => {
  test.use({ colorScheme: 'light', viewport: { width: 390, height: 844 } });

  test('tanıtım ve giriş sayfalarında düğme var ve çalışır', async ({ page }) => {
    for (const route of ['/', '/giris']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Koyu temaya geç' }).click();
      await expect.poll(() => attr(page), route).toBe('dark');
      await page.getByRole('button', { name: 'Açık temaya geç' }).click();
      await expect.poll(() => attr(page), route).toBe('light');
    }
  });
});
