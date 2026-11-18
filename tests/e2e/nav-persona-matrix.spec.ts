import { expect, test, type Page } from './fixture';
import { loginAs } from './login';

/**
 * Gezinme ↔ erişim eşleşmesi (kart 457; R2 451 B1: akademisyen ve bölüm yöneticisi yan menüde "Ders rehberi"ni görüyor,
 * tıklayınca rol uyarısına düşüyordu). Her persona için yan menüde (1440) görünen HER bağlantı açılır: rol uyarısı, 404 ya da
 * giriş isteği yok. "Ders rehberi" yalnız doğrulanmış öğrencide (öğrenci ve üst sınıf mentor) görünür; 390'da telefon
 * Menü'sü aynı kurala uyar. Görünen ama açılmayan öğe bu testi kırar.
 */
const WARNING = /Bu sayfa senin rolün için değil|Aradığın sayfa bulunamadı|Giriş yapman gerekiyor/;
const PERSONAS = [
  { persona: 'student', courseGuide: true },
  { persona: 'seniorMentor', courseGuide: true },
  { persona: 'alumniMentor', courseGuide: false },
  { persona: 'academic', courseGuide: false },
  { persona: 'departmentAdmin', courseGuide: false },
  { persona: 'systemAdmin', courseGuide: false },
] as const;

async function sideHrefs(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  const side = page.getByRole('navigation', { name: 'Yan menü' });
  await expect(side).toBeVisible();
  return side
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')!).filter((href) => href.startsWith('/')),
    );
}

for (const { persona, courseGuide } of PERSONAS) {
  test(`${persona}: yan menüdeki her bağlantı açılır; "Ders rehberi" ${courseGuide ? 'var' : 'yok'} (1440 + 390 Menü)`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, persona);
    const hrefs = await sideHrefs(page);
    expect(hrefs.length, 'yan menüde bağlantı var').toBeGreaterThan(6);
    expect(hrefs.includes('/ders-rehberi'), '1440 yan menüde "Ders rehberi"').toBe(courseGuide);
    const broken: string[] = [];
    for (const href of hrefs) {
      const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      const text = await page
        .locator('main')
        .first()
        .innerText()
        .catch(() => '');
      if (!response?.ok() || WARNING.test(text))
        broken.push(`${href} (${response?.status()}): ${text.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
    expect(broken, 'görünen ama açılmayan gezinme öğeleri').toEqual([]);

    // Telefon: Menü alt sayfası aynı kurala uyar.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page
      .getByRole('navigation', { name: 'Ana gezinme' })
      .getByRole('button', { name: 'Menü' })
      .click();
    const menu = page.getByRole('dialog', { name: 'Menü' });
    await expect(menu).toBeVisible();
    expect(
      (await menu.getByRole('link', { name: 'Ders rehberi' }).count()) > 0,
      '390 Menü\'de "Ders rehberi"',
    ).toBe(courseGuide);
  });
}
