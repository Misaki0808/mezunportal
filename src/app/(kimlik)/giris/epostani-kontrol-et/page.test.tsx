// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { SIGN_IN_LINK_MINUTES } from '@/server/auth/email-port';
import { rememberSignInAddress } from '../sign-in-address';

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
  // Başka tarayıcıda açılan bağlantı: isteği yapan sekmeye sabit yardım (kimlik mantığına dokunmadan).
  expect(screen.getByText('otherBrowser')).toBeVisible();
  expect(screen.getByRole('link', { name: 'back' })).toHaveAttribute('href', '/giris');
});

it('bu sekmede istenen adres sayfada görünür; adres yokken sayfa adressiz de eksiksizdir', async () => {
  window.sessionStorage.clear();
  const { unmount } = renderUi(await CheckEmailPage());
  expect(screen.queryByText(/ayse@ogr\.iu\.edu\.tr/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'back' })).toBeVisible();
  unmount();
  rememberSignInAddress('ayse@ogr.iu.edu.tr');
  renderUi(await CheckEmailPage());
  expect(screen.getByText('ayse@ogr.iu.edu.tr')).toBeVisible();
  window.sessionStorage.clear();
});
