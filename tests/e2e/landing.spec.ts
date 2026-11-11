import { expect, test } from '@playwright/test';

test('girişsiz karşılama ekranının birincil eylemi girişe götürür', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  const heading = page.getByRole('heading', { level: 1 });
  const action = page.getByRole('link', { name: 'İÜ e-postanla başla' }).first();
  await expect(heading).toBeVisible();
  const box = await action.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(780);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await action.click();
  await expect(page).toHaveURL(/\/giris$/);
});

test('hareket azaltıldığında içerik görünür ve dönen satır sabit kalır', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const line = page.locator('.landing-rotating-text');
  const first = await line.textContent();
  await page.waitForTimeout(6500);
  expect(await line.textContent()).toBe(first);
  await expect(page.getByRole('heading', { name: 'Üç adımda başlarsın.' })).toBeVisible();
});

test('dönen satır sürekli döner, DÜĞMESİZDİR; ekran okuyucu yalnız ilk satırı okur', async ({
  page,
}) => {
  await page.goto('/');
  const line = page.locator('.landing-rotating-text');
  const first = (await line.textContent())!;
  await expect(line).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.landing-rotating .sr-only')).toHaveText(first);
  // Kullanıcı kararı (12 Kas): görünür durdur/devam düğmesi yok.
  await expect(page.getByRole('button', { name: /durdur|devam/i })).toHaveCount(0);
  await expect.poll(async () => line.textContent(), { timeout: 7000 }).not.toBe(first);
  await expect(page.locator('.landing-rotating .sr-only')).toHaveText(first);
});

test('fare kahraman metninin üstündeyken dönen satır bekler, çekilince sürer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Fare bekletmesi yalnız hover destekleyen cihazda var; iPhone emülasyonunda (WebKit turu) yoktur ve
  // bu beklenen davranıştır — dokunmatik karşılığı aşağıdaki "dokunmak ... durdurmaz" testindedir.
  test.skip(
    !(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)),
    'hover desteklemeyen (dokunmatik) cihaz',
  );
  const line = page.locator('.landing-rotating-text');
  await page.locator('.landing-hero-copy').hover();
  const held = (await line.textContent())!;
  await page.waitForTimeout(5000);
  expect(await line.textContent(), 'fare üstündeyken satır değişmez').toBe(held);
  await page.mouse.move(5, 5);
  await expect.poll(async () => line.textContent(), { timeout: 7000 }).not.toBe(held);
});

test('masaüstünde sayfa genişliği kullanılır: iki sütun kahraman, sağda örnek kartlar, dolu sayı bandı', async ({
  page,
}) => {
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const copy = (await page.locator('.landing-hero-copy').boundingBox())!;
    const preview = (await page.locator('.landing-preview').boundingBox())!;
    // Önizleme sağ sütunda ve içerik genişliğinin (≈1280 px) sağ kenarına yaslı; kopyanın yanında, altında değil.
    expect(preview.x, `${width}: önizleme kopyanın sağında`).toBeGreaterThan(
      copy.x + copy.width - 1,
    );
    expect(preview.x + preview.width, `${width}: sağ kenar`).toBeGreaterThan(width * 0.6);
    expect(Math.abs(preview.y - copy.y), `${width}: aynı hizada`).toBeLessThan(200);
    // Kapsayıcı genişlemiş: kopya + önizleme birlikte ≥ 1100 px kaplar (eski ~800 px sütun değil).
    expect(preview.x + preview.width - copy.x).toBeGreaterThan(1100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await expect(page.locator('.landing-preview')).toHaveAttribute('aria-hidden', 'true');
});

test('mobilde örnek kartlar gizlidir: ilk ekranı itmez, tek sütun, taşma yok', async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/');
    await expect(page.locator('.landing-preview')).toBeHidden();
    const action = (await page
      .getByRole('link', { name: 'İÜ e-postanla başla' })
      .first()
      .boundingBox())!;
    expect(action.y + action.height).toBeLessThanOrEqual(780);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('karşılama metni JavaScript olmadan sunulur', async ({ browser, baseURL }) => {
  const noScript = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const serverPage = await noScript.newPage();
  await serverPage.goto('/');
  await expect(serverPage.getByRole('heading', { level: 1 })).toContainText(
    'Staj ararken yalnız değilsin.',
  );
  await expect(serverPage.locator('.landing-rotating .sr-only')).toHaveText(
    'Sen giderken dönen arkadaşların var, bir destek alsana?',
  );
  await expect(serverPage.getByRole('link', { name: 'İÜ e-postanla başla' }).first()).toBeVisible();
  await noScript.close();
});

test('Bölümümüz bağlantıları bölümün sayfalarına yeni sekmede, güvenli açılır', async ({
  page,
}) => {
  await page.goto('/');
  const hrefs = [
    'https://mis-iktisat.istanbul.edu.tr/tr/_',
    'https://mis-iktisat.istanbul.edu.tr/tr/akademikkadro',
    'https://www.linkedin.com/company/mis-iktisat/posts/',
    'https://www.instagram.com/mis_iktisat/',
    'https://www.instagram.com/iuybskulubu/',
  ];
  const links = page.locator('#bolumumuz a');
  await expect(links).toHaveCount(hrefs.length);
  for (const [index, href] of hrefs.entries()) {
    const link = links.nth(index);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(
    page.getByText("Bu bir öğrenci projesidir; İstanbul Üniversitesi'nin resmî hizmeti değildir."),
  ).toBeVisible();
});

test('koyu tema (lacivert #0E1A38) ve açık tema (krem) okunabilir kalır', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.landing')).toHaveCSS('background-color', 'rgb(14, 26, 56)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(242, 244, 252)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.landing')).toHaveCSS('background-color', 'rgb(255, 250, 244)');
});

test("çok geniş ekranda (2560, 3440) içerik ekranın ~%83'ünü kaplar; yanlar boş kalmaz", async ({
  page,
}) => {
  for (const width of [1920, 2560, 3440]) {
    await page.setViewportSize({ width, height: 1440 });
    await page.goto('/');
    const box = (await page.locator('.landing-hero-inner').boundingBox())!;
    const ratio = box.width / width;
    // 1920'de 1440 px = %75 (değişmez); 2560/3440'ta sayfa orantılı büyür (zoom): ≥ %78.
    expect(ratio, `${width}: içerik/ekran oranı`).toBeGreaterThan(width === 1920 ? 0.74 : 0.78);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // Sağ sütun (örnek kartlar) içeriğin sağ kenarına dayanır: kutunun sağındaki fark yalnız iç boşluk (gutter) kadardır.
    const preview = (await page.locator('.landing-preview').boundingBox())!;
    const gap = box.x + box.width - (preview.x + preview.width);
    expect(gap, `${width}: önizleme kapsayıcının dışına taşmaz`).toBeGreaterThanOrEqual(-1);
    expect(gap / box.width, `${width}: önizleme sağ kenara yakın`).toBeLessThan(0.06);
  }
});

test('1024 px\'te önizlemedeki "Örnek Mezun" tek satırdır', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const name = page.locator('.landing-preview-mentor p.font-semibold');
  await expect(name).toBeVisible();
  const lines = await name.evaluate(
    (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
  );
  expect(Math.round(lines)).toBe(1);
});

test("390 px'te ✓ simgesi çok satırlı güven metninin İLK satırına hizalıdır", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trust = page.locator('.landing-trust');
  const icon = (await trust.locator('svg').boundingBox())!;
  const text = (await trust.locator('span').boundingBox())!;
  const lineHeight = await trust
    .locator('span')
    .evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(text.height, 'metin çok satırlı').toBeGreaterThan(lineHeight * 1.5);
  // Simgenin merkezi ilk satırın bandında (ortadaki satırda değil).
  const center = icon.y + icon.height / 2;
  expect(center).toBeGreaterThan(text.y);
  expect(center).toBeLessThan(text.y + lineHeight);
});

test('dokunmatik telefonda kahraman metnine dokunmak dönen satırı kalıcı durdurmaz', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  const line = page.locator('.landing-rotating-text');
  expect(
    await page.evaluate(() => matchMedia('(hover: hover)').matches),
    'dokunmatik emülasyonu',
  ).toBe(false);
  await page.locator('.landing-hero-copy h1').tap();
  const first = (await line.textContent())!;
  await expect.poll(async () => line.textContent(), { timeout: 7000 }).not.toBe(first);
  const second = (await line.textContent())!;
  await expect.poll(async () => line.textContent(), { timeout: 7000 }).not.toBe(second);
  await context.close();
});
