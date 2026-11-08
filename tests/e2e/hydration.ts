import { expect, type Page } from '@playwright/test';

/** SSR formu görünebilir olsa da React olay işleyicileri henüz bağlanmamış olabilir. */
export async function waitForHydratedForm(page: Page, submitName: string) {
  const form = page
    .getByRole('button', { name: submitName, exact: true })
    .locator('xpath=ancestor::form');
  await expect(form).toHaveAttribute('data-hydrated', 'true');
}
