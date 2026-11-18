import { expect, test } from './fixture';
import { workerBaseUrl } from './isolation';
import { loginAs } from './login';

/** Deneyim formundaki gerçek Modal: klasik çubukta sabit çubuklar ve içerik aynı yerde kalır. */
for (const classic of [true, false]) {
  for (const width of [390, 1440]) {
    test(`${classic ? 'klasik isteği' : 'kaplama'} çubuk ${width}px: pencere aç/kapa yatay konumu korur`, async ({
      playwright,
      browserName,
    }, info) => {
      const browser = await playwright[browserName].launch(
        classic && browserName === 'chromium' ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {},
      );
      try {
        const context = await browser.newContext({
          baseURL: workerBaseUrl(info.parallelIndex),
          viewport: { width, height: 844 },
        });
        const page = await context.newPage();
        await loginAs(page, 'student');
        await page.goto('/deneyim/yeni');
        // Yalnız klasik kanalda kaydırma alanını zorla; kısa sayfada çubuk çıkmaması ölçümü tesadüfe bağlamasın.
        // Motor/işletim sistemi yine kaplama çizebilir: ayrılan gerçek boşluk aşağıda ölçülür, 15 px varsayılmaz.
        if (classic)
          await page.addStyleTag({
            content:
              'html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; height: 15px; }',
          });
        await page.locator('select').first().selectOption({ index: 1 });
        const measure = () =>
          page.evaluate(() => {
            const get = (selector: string) => {
              const element = document.querySelector(selector);
              if (!element || getComputedStyle(element).display === 'none') return null;
              const rect = element.getBoundingClientRect();
              return { x: rect.x, right: rect.right };
            };
            return {
              width: document.documentElement.clientWidth,
              viewport: innerWidth,
              overflow: document.documentElement.style.overflow,
              bodyOverflow: document.body.style.overflow,
              lockGutter:
                parseFloat(
                  document.documentElement.style.getPropertyValue('--scroll-lock-gutter'),
                ) || 0,
              header: get('header.sticky'),
              nav: get('[data-bottom-nav] li:last-child > *'),
              action: get('[data-action-bar]'),
              toast: get('[role=region] [role=status]'),
              main: get('main h1'),
            };
          });
        const before = await measure();
        const gutter = before.viewport - before.width;
        expect(before.viewport).toBe(width);
        expect(gutter).toBeGreaterThanOrEqual(0);
        expect(before.action, 'gerçek formun eylem çubuğu ölçülmeli').not.toBeNull();
        if (classic && browserName === 'chromium') expect(gutter).toBeGreaterThan(0);
        test.info().annotations.push({
          type: 'ölçüm',
          description: `${browserName}: ${classic ? 'klasik isteği' : 'kaplama'}, gerçek boşluk ${gutter}px`,
        });
        await page
          .locator('header a[href="/"], aside a[href="/"]')
          .filter({ visible: true })
          .first()
          .click();
        await expect(page.locator('dialog[open]')).toBeVisible();
        const open = await measure();
        expect(open.overflow).toBe('hidden');
        expect(open.bodyOverflow).toBe('hidden');
        expect(open.lockGutter).toBe(gutter);
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        const closed = await measure();
        for (const key of ['header', 'nav', 'action', 'toast', 'main'] as const) {
          const initial = before[key];
          if (!initial) continue;
          expect(open[key], `${key} açılış`).not.toBeNull();
          expect(closed[key], `${key} kapanış`).not.toBeNull();
          for (const edge of ['x', 'right'] as const) {
            expect(open[key]![edge], `${key}.${edge} açılış`).toBeCloseTo(initial[edge], 2);
            expect(closed[key]![edge], `${key}.${edge} kapanış`).toBeCloseTo(initial[edge], 2);
          }
        }
        expect(closed.width).toBe(before.width);
        expect(closed.overflow).toBe(before.overflow);
        expect(closed.bodyOverflow).toBe(before.bodyOverflow);
        expect(closed.lockGutter).toBe(before.lockGutter);
        await context.close();
      } finally {
        await browser.close();
      }
    });
  }
}
