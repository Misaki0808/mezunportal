// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rescueFocus } from './focus-rescue';
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});
function pendingRescue() {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  rescueFocus(trigger);
  return trigger;
}
it('belge ortamı kapanınca bekleyen yoklama hata fırlatmadan durur', () => {
  pendingRescue();
  vi.stubGlobal('document', undefined);
  expect(() => vi.advanceTimersByTime(60)).not.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
it('başka belgeye geçildiğinde eski tetikleyici yeni belgenin başlığını değiştirmez', () => {
  const trigger = pendingRescue();
  trigger.remove();
  const next = document.implementation.createHTMLDocument('Yeni belge');
  next.body.innerHTML = '<main><h1>Yeni sayfa</h1></main>';
  vi.stubGlobal('document', next);
  vi.advanceTimersByTime(60);
  expect(next.querySelector('h1')!.hasAttribute('tabindex')).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
