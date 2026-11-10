// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RotatingLine } from './rotating-line';

const LINES = ['Birinci satır', 'İkinci satır', 'Üçüncü satır'];

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
  }));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RotatingLine', () => {
  it('ilk satır sunucu çıktısında vardır; ekran okuyucu yalnız ilkini okur', () => {
    stubReducedMotion(false);
    const { container } = render(<RotatingLine lines={LINES} />);
    expect(container.querySelector('.sr-only')?.textContent).toBe('Birinci satır');
    const animated = container.querySelector('.landing-rotating-text');
    expect(animated?.getAttribute('aria-hidden')).toBe('true');
    expect(animated?.textContent).toBe('Birinci satır');
  });

  it('5,5 saniyede bir yumuşak geçişle sıradaki satıra geçer ve başa döner', () => {
    stubReducedMotion(false);
    const { container } = render(<RotatingLine lines={LINES} />);
    const text = () => container.querySelector('.landing-rotating-text')?.textContent;
    act(() => void vi.advanceTimersByTime(5400));
    expect(text()).toBe('Birinci satır');
    act(() => void vi.advanceTimersByTime(100));
    expect(container.querySelector('.landing-rotating-text')?.getAttribute('data-visible')).toBe(
      'false',
    );
    act(() => void vi.advanceTimersByTime(400));
    expect(text()).toBe('İkinci satır');
    expect(container.querySelector('.landing-rotating-text')?.getAttribute('data-visible')).toBe(
      'true',
    );
    act(() => void vi.advanceTimersByTime(5900 * 2));
    expect(text()).toBe('Birinci satır');
    // ekran okuyucu kopyası hiç değişmez
    expect(container.querySelector('.sr-only')?.textContent).toBe('Birinci satır');
  });

  it('hareket azaltılmışsa ilk satır sabit kalır', () => {
    stubReducedMotion(true);
    const { container } = render(<RotatingLine lines={LINES} />);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(container.querySelector('.landing-rotating-text')?.textContent).toBe('Birinci satır');
  });

  it('tek satırda zamanlayıcı kurulmaz', () => {
    stubReducedMotion(false);
    render(<RotatingLine lines={['Tek']} />);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getAllByText('Tek').length).toBeGreaterThan(0);
  });
});
