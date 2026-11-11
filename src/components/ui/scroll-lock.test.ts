// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { lockScroll } from './scroll-lock';

afterEach(() => {
  document.documentElement.style.overflow = '';
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
  release();
  expect(document.body.style.paddingRight).toBe('4px');
});
