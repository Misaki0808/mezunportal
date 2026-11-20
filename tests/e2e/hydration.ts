import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Ağ sessizliği yerine etkileşimin kendi istemci sınırını bekler. İşaret `useHydrated()` tarafından
 * SSR'de verilmez; o bileşenin istemci render'ı bağlandıktan sonra yazılır. Çağıran, doldurmadan önce
 * ilgili formun düğmesini/alanını verir; başka bir kabuğun hazır olması yeterli değildir.
 */
export async function waitForFormReady(control: Locator) {
  const boundary = control.locator('xpath=ancestor-or-self::*[@data-hydrated][1]');
  await expect(boundary).toHaveAttribute('data-hydrated', 'true');
}

/** SSR formu görünebilir olsa da React olay işleyicileri henüz bağlanmamış olabilir. */
export async function waitForHydratedForm(page: Page, submitName: string) {
  const form = page
    .getByRole('button', { name: submitName, exact: true })
    .locator('xpath=ancestor::form');
  await expect(form).toHaveAttribute('data-hydrated', 'true');
}

/** Form dışında kalan etkileşimli düğmelerin bağlı istemci sınırını bekler. */
export async function waitForHydratedControl(page: Page, name: string) {
  const container = page
    .getByRole('button', { name, exact: true })
    .locator('xpath=ancestor::*[@data-hydrated][1]');
  await expect(container).toHaveAttribute('data-hydrated', 'true');
}
