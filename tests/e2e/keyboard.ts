import type { Page } from '@playwright/test';

/** Safari'nin varsayılan Tab kanalı bağlantı/düğmeleri atlar; Alt+Tab bütün odak hedeflerini dolaşır. */
export async function tabForward(page: Page) {
  const engine = page.context().browser()?.browserType().name();
  await page.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
}
