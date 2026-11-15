// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { ThemeChoice } from './theme-choice';
import { applyBrowserColor, getEffectiveTheme, setTheme } from './theme-client';
import { ThemeToggle } from './theme-toggle';

const LABELS = { toLight: 'Açık temaya geç', toDark: 'Koyu temaya geç' };
const media = { dark: false, listeners: new Set<() => void>() };

beforeEach(() => {
  media.dark = false;
  media.listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return media.dark;
      },
      addEventListener: (_: string, fn: () => void) => media.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => media.listeners.delete(fn),
    })),
  );
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.className = '';
  document.head.innerHTML =
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#5b5bf6"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e1a38">';
  document.cookie = 'theme=; Path=/; Max-Age=0';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const root = () => document.documentElement;
const cookie = () => document.cookie;

describe('setTheme', () => {
  it('çerezi ve <html data-theme> özniteliğini birlikte yazar', () => {
    setTheme('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(cookie()).toContain('theme=dark');
    setTheme('light');
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(cookie()).toContain('theme=light');
    expect(cookie()).not.toContain('theme=dark');
  });

  it('aynı değeri yeniden seçmek bir şey yapmaz (geçiş sınıfı eklenmez)', () => {
    root().setAttribute('data-theme', 'dark');
    setTheme('dark');
    expect(root().classList.contains('theme-transition')).toBe(false);
  });

  it('kısa geçiş sınıfı eklenir ve süre sonunda kalkar', () => {
    vi.useFakeTimers();
    setTheme('dark');
    expect(root().classList.contains('theme-transition')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(root().classList.contains('theme-transition')).toBe(false);
  });

  it('tarayıcı çubuğu rengi seçime uyar; sisteme dönünce her etiket kendi renginde', () => {
    const colors = () =>
      [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
        m.getAttribute('content'),
      );
    setTheme('dark');
    expect(colors()).toEqual(['#0e1a38', '#0e1a38']);
    setTheme('light');
    expect(colors()).toEqual(['#5b5bf6', '#5b5bf6']);
    setTheme('system');
    expect(colors()).toEqual(['#5b5bf6', '#0e1a38']);
    applyBrowserColor('dark');
    expect(colors()).toEqual(['#0e1a38', '#0e1a38']);
  });
});

describe('getEffectiveTheme', () => {
  it('system iken cihaz ayarına, elle seçimde seçime bakar', () => {
    expect(getEffectiveTheme()).toBe('light');
    media.dark = true;
    expect(getEffectiveTheme()).toBe('dark');
    root().setAttribute('data-theme', 'light');
    expect(getEffectiveTheme()).toBe('light');
    root().setAttribute('data-theme', 'dark');
    media.dark = false;
    expect(getEffectiveTheme()).toBe('dark');
  });

  it('bozuk öznitelik system sayılır', () => {
    root().setAttribute('data-theme', 'mor');
    media.dark = true;
    expect(getEffectiveTheme()).toBe('dark');
  });
});

describe('ThemeToggle', () => {
  it('açık temada "Koyu temaya geç" der, basınca koyu seçer ve kalıcı yazar', async () => {
    root().setAttribute('data-theme', 'light');
    const { user } = renderUi(<ThemeToggle labels={LABELS} />);
    await user.click(screen.getByRole('button', { name: 'Koyu temaya geç' }));
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(cookie()).toContain('theme=dark');
    expect(await screen.findByRole('button', { name: 'Açık temaya geç' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Açık temaya geç' }));
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(cookie()).toContain('theme=light');
  });

  it('sistem koyuyken görünen tema koyudur: ilk basış açığa götürür', async () => {
    media.dark = true;
    root().setAttribute('data-theme', 'system');
    const { user } = renderUi(<ThemeToggle labels={LABELS} />);
    await user.click(await screen.findByRole('button', { name: 'Açık temaya geç' }));
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('cihaz ayarı değişince (sistem iken) ad güncellenir', async () => {
    root().setAttribute('data-theme', 'system');
    renderUi(<ThemeToggle labels={LABELS} />);
    expect(screen.getByRole('button', { name: 'Koyu temaya geç' })).toBeInTheDocument();
    media.dark = true;
    act(() => media.listeners.forEach((fn) => fn()));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Açık temaya geç' })).toBeInTheDocument(),
    );
  });

  it('dokunma hedefi ≥ 44 px (size-11) ve simgeler dekoratif', () => {
    renderUi(<ThemeToggle labels={LABELS} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('size-11');
    expect(button.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });
});

describe('ThemeChoice', () => {
  it('üç seçenek, seçili olan aria-pressed; ilk çizimde sunucunun değeri', () => {
    renderUi(
      <>
        <h2 id="b">GÖRÜNÜM</h2>
        <ThemeChoice initial="system" labelledBy="b" />
      </>,
    );
    expect(screen.getByRole('group', { name: 'GÖRÜNÜM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sistem' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Açık' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Koyu' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('seçim çerezi ve özniteliği yazar, basılı düğme taşınır; sisteme dönülür', async () => {
    const { user } = renderUi(<ThemeChoice initial="system" labelledBy="b" />);
    await user.click(screen.getByRole('button', { name: 'Koyu' }));
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(cookie()).toContain('theme=dark');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Koyu' })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByRole('button', { name: 'Sistem' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Sistem' }));
    expect(root().getAttribute('data-theme')).toBe('system');
    expect(cookie()).toContain('theme=system');
  });

  it('üst çubuk düğmesi değişince seçim de değişir (tek kaynak öznitelik)', async () => {
    root().setAttribute('data-theme', 'system');
    const { user } = renderUi(
      <>
        <ThemeToggle labels={LABELS} />
        <ThemeChoice initial="system" labelledBy="b" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Koyu temaya geç' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Koyu' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('dokunma hedefleri ≥ 44 px', () => {
    renderUi(<ThemeChoice initial="light" labelledBy="b" />);
    for (const name of ['Sistem', 'Açık', 'Koyu'])
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
  });
});
