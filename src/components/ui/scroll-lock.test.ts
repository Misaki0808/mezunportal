// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { lockScroll } from './scroll-lock';

afterEach(() => {
  document.documentElement.style.overflow = '';
  document.documentElement.style.removeProperty('--scroll-lock-gutter');
  document.documentElement.removeAttribute('data-scroll-lock-gutter');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  Reflect.deleteProperty(document.documentElement, 'clientWidth');
  Reflect.deleteProperty(window, 'innerWidth');
});

it('aynı kilidi iki kez bırakmak başka açık kilidi çözmez, sayaç eksiye düşmez', () => {
  const first = lockScroll();
  const second = lockScroll();
  first();
  first();
  expect(document.documentElement.style.overflow).toBe('hidden');
  second();
  expect(document.documentElement.style.overflow).toBe('');
  // Eksiye düşen sayaç sonraki kilidi bozardı: yeniden kilitle ve çöz.
  const again = lockScroll();
  expect(document.body.style.overflow).toBe('hidden');
  again();
  expect(document.body.style.overflow).toBe('');
});

it('kaydırma çubuğu genişliği kadar sağ boşluk bırakır ve bırakınca eski değeri geri verir', () => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: 1009,
    configurable: true,
  });
  document.body.style.paddingRight = '4px';
  const release = lockScroll();
  expect(document.body.style.paddingRight).toBe('15px');
  expect(document.documentElement.style.getPropertyValue('--scroll-lock-gutter')).toBe('15px');
  expect(document.documentElement.hasAttribute('data-scroll-lock-gutter')).toBe(true);
  const nested = lockScroll();
  release();
  expect(document.documentElement.hasAttribute('data-scroll-lock-gutter')).toBe(true);
  nested();
  expect(document.body.style.paddingRight).toBe('4px');
  expect(document.documentElement.style.getPropertyValue('--scroll-lock-gutter')).toBe('');
  expect(document.documentElement.hasAttribute('data-scroll-lock-gutter')).toBe(false);
});

it('kaplama çubukta telafi eklemez ve mevcut özel niteliği geri verir', () => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: 1024,
    configurable: true,
  });
  const root = document.documentElement;
  root.style.setProperty('--scroll-lock-gutter', '3px', 'important');
  root.setAttribute('data-scroll-lock-gutter', 'previous');
  const release = lockScroll();
  expect(document.body.style.paddingRight).toBe('');
  release();
  expect(root.style.getPropertyValue('--scroll-lock-gutter')).toBe('3px');
  expect(root.style.getPropertyPriority('--scroll-lock-gutter')).toBe('important');
  expect(root.getAttribute('data-scroll-lock-gutter')).toBe('previous');
});
