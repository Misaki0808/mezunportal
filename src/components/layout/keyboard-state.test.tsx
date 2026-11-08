// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KeyboardState, isEditing } from './keyboard-state';

type Listener = () => void;
function fakeViewport(initialHeight: number) {
  const listeners = new Set<Listener>();
  const viewport = {
    height: initialHeight,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    resize(height: number) {
      viewport.height = height;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  return viewport;
}
const keyboard = () => document.documentElement.dataset.keyboard;

describe('KeyboardState', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    delete document.documentElement.dataset.keyboard;
    Reflect.deleteProperty(window, 'visualViewport');
  });

  it('görsel görünüm alanı küçülür ve metin girişi odaktaysa klavye açık sayılır; kapanınca temizlenir', () => {
    const viewport = fakeViewport(800);
    document.body.innerHTML = '<input id="i" /><button id="b">x</button>';
    render(<KeyboardState />);
    const input = document.getElementById('i') as HTMLInputElement;
    expect(keyboard()).toBeUndefined();
    act(() => input.focus());
    act(() => viewport.resize(480));
    expect(keyboard()).toBe('open');
    act(() => viewport.resize(800));
    expect(keyboard()).toBeUndefined();
  });

  it('adres çubuğu gibi küçük daralma ya da metin dışı odak klavye sayılmaz', () => {
    const viewport = fakeViewport(800);
    document.body.innerHTML =
      '<input id="i" /><button id="b">x</button><input id="c" type="checkbox" />';
    render(<KeyboardState />);
    act(() => (document.getElementById('i') as HTMLInputElement).focus());
    act(() => viewport.resize(700));
    expect(keyboard()).toBeUndefined();
    act(() => (document.getElementById('b') as HTMLButtonElement).focus());
    act(() => viewport.resize(450));
    expect(keyboard()).toBeUndefined();
    act(() => (document.getElementById('c') as HTMLInputElement).focus());
    expect(keyboard()).toBeUndefined();
  });

  it('odak metin girişinden ayrılınca klavye durumu kalkar; bileşen kalkınca dinleyiciler ve durum temizlenir', () => {
    const viewport = fakeViewport(800);
    document.body.innerHTML = '<textarea id="t"></textarea><button id="b">x</button>';
    const { unmount } = render(<KeyboardState />);
    act(() => (document.getElementById('t') as HTMLTextAreaElement).focus());
    act(() => viewport.resize(450));
    expect(keyboard()).toBe('open');
    act(() => (document.getElementById('b') as HTMLButtonElement).focus());
    expect(keyboard()).toBeUndefined();
    act(() => (document.getElementById('t') as HTMLTextAreaElement).focus());
    expect(keyboard()).toBe('open');
    unmount();
    expect(keyboard()).toBeUndefined();
    expect(viewport.listenerCount()).toBe(0);
  });

  it('visualViewport yoksa hiçbir şey yapmaz', () => {
    Reflect.deleteProperty(window, 'visualViewport');
    expect(() => render(<KeyboardState />)).not.toThrow();
    expect(keyboard()).toBeUndefined();
  });

  it('isEditing yalnız metin girişlerini tanır', () => {
    document.body.innerHTML =
      '<input id="a"/><input id="r" type="radio"/><textarea id="t"></textarea><select id="s"></select><div id="d"></div>';
    const get = (id: string) => document.getElementById(id);
    expect(isEditing(get('a'))).toBe(true);
    expect(isEditing(get('t'))).toBe(true);
    expect(isEditing(get('s'))).toBe(true);
    expect(isEditing(get('r'))).toBe(false);
    expect(isEditing(get('d'))).toBe(false);
    expect(isEditing(null)).toBe(false);
  });
});
