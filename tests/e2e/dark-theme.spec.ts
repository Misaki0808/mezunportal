import { SCAN, SCREENS, scan } from './contrast-scan';
import { loginAs } from './login';
import { expect, test } from './fixture';

// Kart 280: koyu tema hiç bütünüyle taranmamıştı. Bu senaryo, 390 px koyu kipte seçili ekranlarda HESAPLANMIŞ stilden WCAG AA
// karşıtlığını ölçer: metin (normal ≥ 4,5, büyük ≥ 3), yer tutucu (≥ 4,5) ve kit kontrol sınırı/dolgusu (≥ 3). Devre dışı öğeler,
// görünmez (opacity 0 ya da sr-only) öğeler ve tarayıcının kendi çizdiği onay kutusu/radyo düğmeleri dışarıda kalır.
// Token çiftlerinin kendisi `src/lib/contrast.test.ts`'tedir; bu test token'ların EKRANDA doğru birleşip birleşmediğine bakar
// (ör. kontrol sınırında dekoratif `border` token'ı: koyu 1,77:1).
test.use({ colorScheme: 'dark', viewport: { width: 390, height: 844 } });

test('koyu tema taraması renkleri doğru çözer: oklab, color-mix ve saydam renk şeffaf sayılmaz', async ({
  page,
}) => {
  await page.goto('/giris');
  const { colors } = await page.evaluate(SCAN, [
    'rgb(255, 0, 0)',
    'rgba(0, 0, 0, 0.5)',
    'oklab(1 0 0)',
    'color-mix(in srgb, #ff0000 50%, transparent)',
    'rgba(0, 0, 0, 0)',
  ]);
  expect(colors[0]).toEqual([255, 0, 0, 1]);
  expect(colors[1]![3]).toBeCloseTo(0.5, 1);
  expect(colors[2]).toEqual([255, 255, 255, 1]);
  expect(colors[3]!.slice(0, 3)).toEqual([255, 0, 0]);
  expect(colors[3]![3]).toBeCloseTo(0.5, 1);
  expect(colors[4]).toEqual([0, 0, 0, 0]);
  // Çözülemeyen değer sessizce şeffaf sayılmaz.
  await expect(page.evaluate(SCAN, ['bu-bir-renk-degil'])).rejects.toThrow(/çözümlenemeyen renk/);
});

for (const [persona, routes] of Object.entries(SCREENS)) {
  test(`koyu tema (390 px, ${persona}): metin, yer tutucu ve kontrol sınırı WCAG AA`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, persona as 'student' | 'systemAdmin');
    for (const route of routes) {
      expect(await scan(page, route), `koyu tema karşıtlık hataları: ${persona} ${route}`).toEqual(
        [],
      );
    }
  });
}

// Ayar ekranının ilk yüklemesi başarı metnini içermez; Kaydet sonrasındaki gerçek durumu da ölç.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`iş arayan ayarı başarı iletisi (${colorScheme})`, () => {
    test.use({ colorScheme });
    test('kaydedilen tercih görünür ve WCAG AA karşıtlığında', async ({ page }) => {
      await loginAs(page, 'student');
      await page.goto('/hesap/staj-ariyorum');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
      const saved = page.getByRole('status').filter({ hasText: 'Tercihin kaydedildi.' });
      await expect(saved).toBeVisible();
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      ).toContain(colorScheme);
      expect((await page.evaluate(SCAN)).issues).toEqual([]);
    });
  });
}
