// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithToasts } from '@/test/render';
import { CvDownloads } from './cv-downloads';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('dosya arada silinirse sunucunun kararlı kodu kullanıcıya gösterilir', async () => {
  const fetcher = vi.fn(async () => ({
    ok: false,
    json: async () => ({ errorCode: 'RESOURCE_NOT_FOUND' }),
  }));
  vi.stubGlobal('fetch', fetcher);
  const { user } = renderWithToasts(
    <CvDownloads files={[{ id: 'synthetic', date: '20.11.2026', hasFile: true }]} />,
  );
  const link = screen.getByRole('link', { name: 'CV dosyasını indir (1)' });
  expect(link).toHaveAttribute('href', '/api/hesabim/cv/synthetic');
  await user.click(link);
  expect(await screen.findByText('Aradığın kayıt bulunamadı.')).toHaveAttribute('role', 'alert');
  expect(fetcher).toHaveBeenCalledWith('/api/hesabim/cv/synthetic', { cache: 'no-store' });
});
it('saklanmayan dosya indirme düğmesi yerine durumla gösterilir', () => {
  renderWithToasts(<CvDownloads files={[{ id: 'old', date: '20.11.2026', hasFile: false }]} />);
  expect(screen.getByText('Dosya artık saklanmıyor.')).toBeVisible();
  expect(screen.queryByRole('link', { name: /CV dosyasını indir/ })).toBeNull();
});
