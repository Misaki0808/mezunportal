// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { SIGN_IN_LINK_MINUTES } from '@/server/auth/email-port';

// Çeviri: anahtar + değerler görünür olsun; `rich` anahtarı döner.
vi.mock('next-intl/server', () => ({
  getTranslations: async () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { rich: (key: string) => key },
    ),
}));
import CheckEmailPage from './page';

it('geçerlilik süresi bağlantı e-postasındaki sabitle aynıdır; yanlış adres için çıkış yolu yazılıdır', async () => {
  renderUi(await CheckEmailPage());
  // Süre elle yazılmaz: e-postadaki sabitten gelir, ikisi birlikte değişir.
  expect(SIGN_IN_LINK_MINUTES).toBeGreaterThan(0);
  expect(screen.getByText(`security:{"minutes":${SIGN_IN_LINK_MINUTES}}`)).toBeVisible();
  expect(screen.getByText('wrongAddress')).toBeVisible();
  expect(screen.getByRole('link', { name: 'back' })).toHaveAttribute('href', '/giris');
});
