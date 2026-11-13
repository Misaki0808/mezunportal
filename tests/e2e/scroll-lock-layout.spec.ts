import { chromium } from '@playwright/test';
import { expect, test } from './fixture';
import { workerBaseUrl } from './isolation';
import { loginAs } from './login';

/** Deneyim formundaki gerçek Modal: klasik çubukta sabit çubuklar ve içerik aynı yerde kalır. */
for (const classic of [true, false]) {
  for (const width of [390, 1440]) {
    test(`${classic ? 'klasik' : 'kaplama'} çubuk ${width}px: pencere aç/kapa yatay konumu korur`, async ({}, info) => {
      const browser = await chromium.launch(
        classic ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {},
      );
      try {
        const context = await browser.newContext({
          baseURL: workerBaseUrl(info.parallelIndex),
          viewport: { width, height: 844 },
        });
        const page = await context.newPage();
        await loginAs(page, 'student');
        await page.goto('/deneyim/yeni');
        // macOS'ta sistemin kaplama çubuğunu klasik yer kaplayan çubuğa zorlar; 15 px gerçekten ayrılmalı.
        if (classic)
          await page.addStyleTag({ content: '::-webkit-scrollbar { width: 15px; height: 15px; }' });
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
              header: get('header.sticky'),
              nav: get('[data-bottom-nav] li:last-child a'),
              action: get('.sticky-actions'),
              toast: get('[role=region] [role=status]'),
              main: get('main h1'),
            };
          });
        const before = await measure();
        expect(before.width).toBe(width - (classic ? 15 : 0));
        await page
          .locator('header a[href="/"], aside a[href="/"]')
          .filter({ visible: true })
          .first()
          .click();
        await expect(page.locator('dialog[open]')).toBeVisible();
        const open = await measure();
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
        await context.close();
      } finally {
        await browser.close();
      }
    });
  }
}
