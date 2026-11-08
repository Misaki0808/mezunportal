import { expect, type Page } from '@playwright/test';

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
