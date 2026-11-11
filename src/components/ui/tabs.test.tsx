// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Tabs } from './tabs';

const items = [
  { id: 'a', label: 'Hakkında', content: <p>A içeriği</p> },
  { id: 'b', label: 'Deneyim', content: <p>B içeriği</p> },
  { id: 'c', label: 'Eğitim', content: <p>C içeriği</p> },
];

describe('Tabs', () => {
  it('liste adlandırılır; seçili sekme aria-selected ve panelle etiketlidir', () => {
    renderUi(<Tabs label="Profil bölümleri" items={items} />);

    expect(screen.getByRole('tablist', { name: 'Profil bölümleri' })).toBeInTheDocument();
    const selected = screen.getByRole('tab', { name: 'Hakkında' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Hakkında' })).toHaveTextContent('A içeriği');
  });

  it('yalnız seçili sekme sekme sırasındadır (roving tabindex)', () => {
    renderUi(<Tabs label="Profil" items={items} />);

    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Deneyim' })).toHaveAttribute('tabindex', '-1');
  });

  it('ok tuşları, Home ve End sekmeleri gezer, odağı ve seçimi taşır', async () => {
    const { user } = renderUi(<Tabs label="Profil" items={items} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Deneyim' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Deneyim' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Deneyim' })).toHaveTextContent('B içeriği');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Eğitim' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Eğitim' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Hakkında' })).toHaveFocus();
  });

  it('şerit sığmayınca kenar ipucu çizilir; seçilen sekme yalnız şeritte yatay kaydırılır, sayfa kaymaz', async () => {
    const strip: unknown[] = [];
    const page: string[] = [];
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: (options: unknown) => strip.push(options),
      configurable: true,
      writable: true,
    });
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      page.push(this.textContent ?? '');
    };
    const { user } = renderUi(<Tabs label="Profil" items={items} />);
    const list = screen.getByRole('tablist');
    // jsdom'da ölçü yok: taşan şerit taklidi (içerik 400, görünen 200, başta).
    Object.defineProperty(list, 'scrollWidth', { value: 400, configurable: true });
    Object.defineProperty(list, 'clientWidth', { value: 200, configurable: true });
    list.dispatchEvent(new Event('scroll'));
    expect(await screen.findByText('', { selector: '[data-tabs-fade="end"]' })).toBeInTheDocument();
    expect(document.querySelector('[data-tabs-fade="start"]')).toBeNull();
    const tab = screen.getByRole('tab', { name: 'Eğitim' });
    Object.defineProperty(tab, 'offsetLeft', { value: 300, configurable: true });
    Object.defineProperty(tab, 'offsetWidth', { value: 100, configurable: true });
    strip.length = 0;
    await user.click(tab);
    // 300 − (200 − 100) / 2: sekme şeridin ortasına gelir.
    expect(strip).toContainEqual({ left: 250 });
    expect(page).toEqual([]);
    Reflect.deleteProperty(Element.prototype, 'scrollTo');
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('genişlik değişince seçim değişmeden etkin sekmeyi yeniden görünür alana alır', () => {
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const visible: unknown[] = [];
    const page: string[] = [];
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: (options: unknown) => visible.push(options),
      configurable: true,
      writable: true,
    });
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      page.push(this.textContent ?? '');
    };
    try {
      renderUi(<Tabs label="Profil" items={items} defaultId="c" />);
      visible.length = 0;
      act(() => resize?.([], {} as ResizeObserver));
      expect(visible).toHaveLength(1);
      expect(page).toEqual([]);
      expect(screen.getByRole('tab', { name: 'Eğitim' })).toHaveAttribute('aria-selected', 'true');
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(Element.prototype, 'scrollTo');
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});
