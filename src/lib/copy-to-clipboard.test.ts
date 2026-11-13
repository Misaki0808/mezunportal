// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyToClipboard } from './copy-to-clipboard';

type Doc = { execCommand?: (command: string) => boolean };

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
function setExec(fn: ((command: string) => boolean) | undefined) {
  (document as unknown as Doc).execCommand = fn;
}

beforeEach(() => {
  setClipboard(undefined);
  setExec(undefined);
});
afterEach(() => {
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  delete (document as unknown as Doc).execCommand;
});

describe('copyToClipboard', () => {
  it('pano varsa onu kullanır, eski yola gitmez', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const exec = vi.fn(() => true);
    setClipboard({ writeText });
    setExec(exec);
    expect(await copyToClipboard('https://example.org/a')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.org/a');
    expect(exec).not.toHaveBeenCalled();
  });

  it('pano yoksa (http ağ adresi) seçim + execCommand ile kopyalar ve geçici alanı kaldırır', async () => {
    let copied = '';
    setExec((command) => {
      const area = document.activeElement as HTMLTextAreaElement;
      copied = `${command}:${area.value.slice(area.selectionStart, area.selectionEnd)}`;
      return true;
    });
    expect(await copyToClipboard('adres-metni')).toBe(true);
    expect(copied).toBe('copy:adres-metni');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('writeText reddedilirse (izin yok) eski yola düşer', async () => {
    setClipboard({
      writeText: vi.fn().mockRejectedValue(new DOMException('izin', 'NotAllowedError')),
    });
    setExec(() => true);
    expect(await copyToClipboard('x')).toBe(true);
  });

  it('ikisi de olmazsa false döner ve fırlatmaz', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('kapalı')) });
    setExec(() => false);
    expect(await copyToClipboard('x')).toBe(false);
    setExec(() => {
      throw new Error('desteklenmiyor');
    });
    expect(await copyToClipboard('x')).toBe(false);
    setExec(undefined);
    expect(await copyToClipboard('x')).toBe(false);
  });

  it('eski yoldan sonra odak önceki öğeye döner', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    setExec(() => true);
    await copyToClipboard('x');
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
