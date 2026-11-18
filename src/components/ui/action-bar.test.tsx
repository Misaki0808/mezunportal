// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { renderUi } from '@/test/render';

import { ActionBar } from './action-bar';

const VAR = '--action-bar-h';
const read = () => document.documentElement.style.getPropertyValue(VAR);
const heights = new Map<Element, number>();
let observers: { callback: () => void; target?: Element; disconnected: boolean }[] = [];

beforeEach(() => {
  heights.clear();
  observers = [];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { height: heights.get(this) ?? 0 } as DOMRect;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry: (typeof observers)[number];
      constructor(callback: () => void) {
        this.entry = { callback, disconnected: false };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(VAR);
});

describe('ActionBar', () => {
  it('bağlanınca yüksekliğini yazar, boyu değişince günceller, kalkınca siler', () => {
    heights.set(document.createElement('div'), 0);
    const { unmount } = renderUi(<ActionBar data-testid="bar">x</ActionBar>);
    const bar = screen.getByTestId('bar');
    expect(bar).toHaveAttribute('data-action-bar');
    heights.set(bar, 0);
    act(() => observers[0]!.callback());
    expect(read()).toBe('');
    heights.set(bar, 71.2);
    act(() => observers[0]!.callback());
    expect(read()).toBe('72px');
    heights.set(bar, 96);
    act(() => observers[0]!.callback());
    expect(read()).toBe('96px');
    unmount();
    expect(read()).toBe('');
    expect(observers[0]!.disconnected).toBe(true);
  });

  it('rota değişimi: çubuk bağlanıp kalkarken değişken yeni durumu izler (eski çubuk 124 px bırakmaz)', () => {
    function Page() {
      const [hasBar, setHasBar] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setHasBar((value) => !value)}>
            geç
          </button>
          {hasBar && <ActionBar data-testid="bar">x</ActionBar>}
        </>
      );
    }
    renderUi(<Page />);
    heights.set(screen.getByTestId('bar'), 124);
    act(() => observers[0]!.callback());
    expect(read()).toBe('124px');
    act(() => screen.getByRole('button', { name: 'geç' }).click());
    expect(read()).toBe('');
    act(() => screen.getByRole('button', { name: 'geç' }).click());
    heights.set(screen.getByTestId('bar'), 88);
    act(() => observers[1]!.callback());
    expect(read()).toBe('88px');
  });

  it('iki çubuk bağlıysa en yükseği kalır; biri kalkınca diğerinin yüksekliğine döner', () => {
    function Page({ second }: { second: boolean }) {
      return (
        <>
          <ActionBar data-testid="a">a</ActionBar>
          {second && <ActionBar data-testid="b">b</ActionBar>}
        </>
      );
    }
    const { rerender } = renderUi(<Page second />);
    heights.set(screen.getByTestId('a'), 60);
    heights.set(screen.getByTestId('b'), 100);
    act(() => observers.forEach((o) => o.callback()));
    expect(read()).toBe('100px');
    rerender(<Page second={false} />);
    expect(read()).toBe('60px');
  });

  it('telefonda sabit kap + akışta aynı yükseklikte boşluk; çubuk kabın içinde (kart 453, R2 B4)', () => {
    const { container } = renderUi(<ActionBar data-testid="bar">x</ActionBar>);
    const [spacer, frame] = [...container.children] as HTMLElement[];
    // Boşluk çubuktan ÖNCE gelir, ekran okuyucudan gizlidir, yüksekliği --action-bar-h; lg'de ve klavye açıkken yoktur.
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(spacer).toHaveAttribute('data-action-bar-spacer');
    expect(spacer).toHaveClass('h-[var(--action-bar-h,0px)]', 'lg:hidden');
    expect(spacer.className).toContain('[:root[data-keyboard=open]_&]:hidden');
    // Kap: sabit, alt gezinmenin üstünde (nav yüksekliği ya da 4,5 rem + güvenli alan), lg'de `contents`, klavyede akışa döner.
    expect(frame).toHaveAttribute('data-action-bar-frame');
    expect(frame).toHaveClass('fixed', 'inset-x-0', 'lg:contents');
    expect(frame.className).toContain('var(--bottom-nav-height,0px)');
    expect(frame.className).toContain('calc(4.5rem+env(safe-area-inset-bottom))');
    expect(frame.className).toContain('[[data-no-nav]_&]:bottom-[env(safe-area-inset-bottom)]');
    expect(frame.className).toContain('[:root[data-keyboard=open]_&]:static');
    expect(frame).not.toHaveClass('sticky');
    expect(frame).toContainElement(screen.getByTestId('bar'));
  });

  it('enabled=false kabı çubuk olmadan çizer: işaret ve ölçüm yok', () => {
    renderUi(
      <ActionBar enabled={false} data-testid="bar">
        x
      </ActionBar>,
    );
    expect(screen.getByTestId('bar')).not.toHaveAttribute('data-action-bar');
    // Kap ve boşluk da yok: katılımı doğrulanmış kullanıcının içeriği akışta kalır.
    expect(document.querySelector('[data-action-bar-frame], [data-action-bar-spacer]')).toBeNull();
    expect(observers).toHaveLength(0);
    expect(read()).toBe('');
  });

  it('ResizeObserver yoksa pencere yeniden boyutlanınca ölçer', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { unmount } = renderUi(<ActionBar data-testid="bar">x</ActionBar>);
    heights.set(screen.getByTestId('bar'), 50);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(read()).toBe('50px');
    unmount();
    expect(read()).toBe('');
  });
});
