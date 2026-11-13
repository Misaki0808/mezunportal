// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithToasts } from '@/test/render';

import { CopyButton } from './copy-button';

type Doc = { execCommand?: (command: string) => boolean };
const URL_TEXT = 'https://mezun.example/dogrula/ABC123';

function clipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
afterEach(() => {
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  delete (document as unknown as Doc).execCommand;
});

function view(multiline = false, text = URL_TEXT) {
  return renderWithToasts(
    <div className="flex flex-wrap gap-2">
      <CopyButton
        text={text}
        copiedMessage="Bağlantı kopyalandı."
        failedMessage="Kopyalanamadı. Bağlantıyı aşağıdan seçip kopyalayabilirsin."
        fieldLabel="Doğrulama bağlantısı"
        multiline={multiline}
      >
        Kopyala
      </CopyButton>
    </div>,
  );
}

describe('CopyButton', () => {
  it('başarıda kısa toast gösterir, alan ve uyarı çıkmaz', async () => {
    const { user } = view();
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard({ writeText });
    await user.click(screen.getByRole('button', { name: 'Kopyala' }));
    expect(await screen.findByText('Bağlantı kopyalandı.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.queryByText(/Kopyalanamadı/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('pano reddederse doğru cümle ve metni seçili salt okunur alan görünür; başarı toast’ı çıkmaz', async () => {
    const { user } = view();
    clipboard({ writeText: vi.fn().mockRejectedValue(new Error('kapalı')) });
    (document as unknown as Doc).execCommand = () => false;
    await user.click(screen.getByRole('button', { name: 'Kopyala' }));
    const alert = await screen.findByText(
      'Kopyalanamadı. Bağlantıyı aşağıdan seçip kopyalayabilirsin.',
    );
    expect(alert).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(/Alanları kontrol/)).toBeNull();
    expect(screen.queryByText('Bağlantı kopyalandı.')).toBeNull();
    const field = screen.getByRole('textbox', { name: 'Doğrulama bağlantısı' }) as HTMLInputElement;
    expect(field).toHaveAttribute('readonly');
    expect(field.value).toBe(URL_TEXT);
    await waitFor(() => expect(field).toHaveFocus());
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(URL_TEXT.length);
  });

  it('pano hiç yoksa (http ağ adresi) eski yol da olmazsa aynı geri dönüş gelir', async () => {
    const { user } = view();
    clipboard(undefined);
    await user.click(screen.getByRole('button', { name: 'Kopyala' }));
    expect(
      await screen.findByRole('textbox', { name: 'Doğrulama bağlantısı' }),
    ).toBeInTheDocument();
  });

  it('başarısızlıktan sonra yeniden deneyip başarılırsa alan kaybolur ve toast çıkar', async () => {
    const { user } = view();
    clipboard(undefined);
    await user.click(screen.getByRole('button', { name: 'Kopyala' }));
    await screen.findByText(/Kopyalanamadı/);
    clipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    await user.click(screen.getByRole('button', { name: 'Kopyala' }));
    expect(await screen.findByText('Bağlantı kopyalandı.')).toBeInTheDocument();
    expect(screen.queryByText(/Kopyalanamadı/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('başarısızlıkta alan sabit alt gezinmenin arkasında kalmaz: payı taşır, odak kaydırmaz, görünür yere biz kaydırırız', async () => {
    const scroll = vi.fn();
    (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView = scroll;
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      const { user } = view();
      clipboard(undefined);
      await user.click(screen.getByRole('button', { name: 'Kopyala' }));
      const field = await screen.findByRole('textbox', { name: 'Doğrulama bağlantısı' });
      // `focus()` kaydırması tarayıcıya bağlı (WebKit hiç kaydırmaz, Chromium alanı kenarda bırakır): kendimiz kaydırırız.
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
      expect(scroll.mock.contexts.at(-1)).toBe(field);
      expect(field).toHaveClass('scroll-above-bars');
    } finally {
      focus.mockRestore();
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('çok satırlı alan da aynı payı taşır ve kaydırılır', async () => {
    const scroll = vi.fn();
    (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView = scroll;
    try {
      const { user } = view(true, 'uzun paylaşım metni ' + URL_TEXT);
      clipboard(undefined);
      await user.click(screen.getByRole('button', { name: 'Kopyala' }));
      const field = await screen.findByRole('textbox', { name: 'Doğrulama bağlantısı' });
      expect(field.tagName).toBe('TEXTAREA');
      expect(field).toHaveClass('scroll-above-bars');
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('uzun metinde çok satırlı alan kullanır ve metni tamamen seçer', async () => {
    const sentence = 'İstanbul Üniversitesi YBS bölümünde ödül aldım. Doğrula: ' + URL_TEXT;
    const { user } = view(true, sentence);
    clipboard(undefined);
    await user.click(screen.getByRole('button', { name: 'Kopyala' }));
    const field = (await screen.findByRole('textbox', {
      name: 'Doğrulama bağlantısı',
    })) as HTMLTextAreaElement;
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.value).toBe(sentence);
    await waitFor(() => expect(field).toHaveFocus());
    expect(field.selectionEnd - field.selectionStart).toBe(sentence.length);
  });
});
