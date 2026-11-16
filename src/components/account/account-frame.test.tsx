// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { AccountFrameView } from './account-frame';

describe('AccountFrameView (hesap alt sayfası çerçevesi)', () => {
  it('geri bağlantısı, üst etiket ve tek h1 yazar; içerik çerçevenin içindedir', () => {
    renderUi(
      <AccountFrameView
        eyebrow="HESAP"
        backLabel="Hesap ayarları"
        title="Ad soyad"
        description="Görünen adın."
      >
        <p>İçerik</p>
      </AccountFrameView>,
    );
    expect(screen.getByRole('link', { name: 'Hesap ayarları' })).toHaveAttribute('href', '/hesap');
    expect(screen.getByText('HESAP')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ad soyad' })).toBeInTheDocument();
    expect(screen.getByText('İçerik')).toBeInTheDocument();
  });

  it('geri hedefi değiştirilebilir ve gizlenebilir; kabuk dolgusu çerçevede yazılı değildir', () => {
    const { container, rerender } = renderUi(
      <AccountFrameView
        eyebrow="HESAP"
        backLabel="Geri dön"
        title="Başlık"
        back={{ href: '/randevular' }}
      >
        x
      </AccountFrameView>,
    );
    expect(screen.getByRole('link', { name: 'Geri dön' })).toHaveAttribute('href', '/randevular');
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('max-w-3xl');
    expect(root.className).not.toMatch(/\bmx-auto\b|\bpx-\d/);
    rerender(
      <AccountFrameView eyebrow="HESAP" backLabel="Geri dön" title="Başlık" showBack={false}>
        x
      </AccountFrameView>,
    );
    expect(screen.queryByRole('link', { name: 'Geri dön' })).not.toBeInTheDocument();
  });
});
