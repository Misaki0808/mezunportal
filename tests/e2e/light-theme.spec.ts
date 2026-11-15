import { SCREENS, scan } from './contrast-scan';
import { loginAs } from './login';
import { expect, test } from './fixture';

// Kart 383: açık mod bugüne dek taranmamıştı (koyu mod kart 280'de tarandı). Aynı HESAPLANMIŞ stil taramasını (metin, yer tutucu,
// kontrol sınırı; WCAG AA) açık temada 390 ve 1440 px'te koşar. İki yol ölçülür:
//  - ELLE açık: sistem KOYU olsa bile `theme=light` çerezi açık temayı zorlar (kullanıcının Mac'i koyu, düğmeyle açık seçmesi);
//  - sistem açık: çerez yok, cihaz açık.
const VIEWPORTS = [
  ['390 px', { width: 390, height: 844 }],
  ['1440 px', { width: 1440, height: 900 }],
] as const;

for (const [viewportName, viewport] of VIEWPORTS) {
  for (const [mode, colorScheme, cookie] of [
    ['elle açık (sistem koyu)', 'dark', 'light'],
    ['sistem açık', 'light', undefined],
  ] as const) {
    test.describe(`açık tema, ${viewportName}, ${mode}`, () => {
      test.use({ colorScheme, viewport });

      for (const [persona, routes] of Object.entries(SCREENS)) {
        test(`${persona}: metin, yer tutucu ve kontrol sınırı WCAG AA`, async ({
          page,
          context,
          baseURL,
        }) => {
          test.setTimeout(150_000);
          if (cookie) await context.addCookies([{ name: 'theme', value: cookie, url: baseURL! }]);
          await loginAs(page, persona as 'student' | 'systemAdmin');
          for (const route of routes) {
            expect(
              await scan(page, route, 'light'),
              `açık tema karşıtlık hataları: ${persona} ${route}`,
            ).toEqual([]);
            // Elle açık seçim, koyu sistemde de gerçekten açık çizer (zemin açık kâğıt, koyu lacivert değil).
            expect(
              await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
              `zemin açık olmalı: ${route}`,
            ).toBe('rgb(244, 245, 250)');
          }
        });
      }
    });
  }
}

// Giriş yapmamış sayfalar (tanıtım, giriş, hukuki metinler): ilk izlenim bu ekranlardır. Hem açık hem koyu, 390 ve 1440 px.
for (const [viewportName, viewport] of VIEWPORTS) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`giriş yapmamış sayfalar, ${scheme} tema, ${viewportName}`, () => {
      // Sistem karşıt tutulur: tarama ELLE seçimi (çerez) ölçer, cihaz ayarını değil.
      test.use({ colorScheme: scheme === 'light' ? 'dark' : 'light', viewport });

      test('tanıtım, giriş ve hukuki sayfalar WCAG AA', async ({ page, context, baseURL }) => {
        test.setTimeout(120_000);
        await context.addCookies([{ name: 'theme', value: scheme, url: baseURL! }]);
        for (const route of ['/', '/giris', '/hukuki/aydinlatma', '/hukuki/kullanim-sartlari']) {
          expect(
            await scan(page, route, scheme),
            `${scheme} tema karşıtlık hataları (giriş yapmamış): ${route}`,
          ).toEqual([]);
        }
      });
    });
  }
}
