// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RotatingLine } from './rotating-line';
const LINES = ['Birinci satır', 'İkinci satır', 'Üçüncü satır'];
const LABELS = {
  pauseText: 'Durdur',
  resumeText: 'Devam et',
  pauseLabel: 'Dönen metni durdur',
  resumeLabel: 'Dönen metni devam ettir',
  reducedLabel: 'Hareket azaltıldı',
};
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
  }));
}
beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('RotatingLine', () => {
  it('ilk satır ekran okuyucuya gösterilir', () => {
    stubReducedMotion(false);
    const { container } = render(<RotatingLine lines={LINES} {...LABELS} />);
    expect(container.querySelector('.sr-only')?.textContent).toBe('Birinci satır');
    expect(container.querySelector('.landing-rotating-text')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
  it('durdurma ve sürdürme zamanlayıcıyı yönetir, tercih yeniden yüklemede korunur', () => {
    stubReducedMotion(false);
    const { container, unmount } = render(<RotatingLine lines={LINES} {...LABELS} />);
    act(() => void vi.advanceTimersByTime(5900));
    expect(container.querySelector('.landing-rotating-text')?.textContent).toBe('İkinci satır');
    fireEvent.click(screen.getByRole('button', { name: 'Dönen metni durdur' }));
    expect(window.localStorage.getItem('mezunportal:landing-motion-paused')).toBe('true');
    act(() => void vi.advanceTimersByTime(30_000));
    expect(container.querySelector('.landing-rotating-text')?.textContent).toBe('İkinci satır');
    unmount();
    const next = render(<RotatingLine lines={LINES} {...LABELS} />);
    expect(screen.getByRole('button', { name: 'Dönen metni devam ettir' })).toBeTruthy();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(next.container.querySelector('.landing-rotating-text')?.textContent).toBe(
      'Birinci satır',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dönen metni devam ettir' }));
    act(() => void vi.advanceTimersByTime(5900));
    expect(next.container.querySelector('.landing-rotating-text')?.textContent).toBe(
      'İkinci satır',
    );
  });
  it('geçiş ortasında durdurma metni gizli bırakmaz', () => {
    stubReducedMotion(false);
    const { container } = render(<RotatingLine lines={LINES} {...LABELS} />);
    act(() => void vi.advanceTimersByTime(5500));
    fireEvent.click(screen.getByRole('button', { name: 'Dönen metni durdur' }));
    expect(container.querySelector('.landing-rotating-text')?.getAttribute('data-visible')).toBe(
      'true',
    );
  });
  it('hareket azaltma tercihinde sabit kalır ve durum bildirilir', () => {
    stubReducedMotion(true);
    const { container } = render(<RotatingLine lines={LINES} {...LABELS} />);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(container.querySelector('.landing-rotating-text')?.textContent).toBe('Birinci satır');
    expect(screen.getByRole('button', { name: 'Hareket azaltıldı' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
  it('tek satır zamanlayıcı veya kontrol oluşturmaz', () => {
    stubReducedMotion(false);
    render(<RotatingLine lines={['Tek']} {...LABELS} />);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
