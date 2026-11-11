// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RotatingLine } from './rotating-line';

const LINES = ['Birinci satır', 'İkinci satır', 'Üçüncü satır'];
// Aralık 3,6 sn + geçiş 0,26 sn: bir satır değişimi ≈ 3,9 sn.
const STEP = 3900;

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
  }));
}
/** Gerçek sayfadaki gibi: dönen satır `.landing-hero-copy` bölgesinin içindedir (fare/odak bekletme bölgesi). */
function setup(lines: readonly string[] = LINES) {
  const view = render(
    <div className="landing-hero-copy">
      <RotatingLine lines={lines} />
      <a href="#a" data-testid="inside-a">
        iç bağlantı A
      </a>
      <a href="#b" data-testid="inside-b">
        iç bağlantı B
      </a>
    </div>,
  );
  const zone = view.container.querySelector('.landing-hero-copy')!;
  const text = () => view.container.querySelector('.landing-rotating-text');
  return { ...view, zone, text };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RotatingLine', () => {
  it('ilk satır ekran okuyucuya gösterilir; dönen metin gizli; DÜĞME ve canlı bölge yoktur', () => {
    stubReducedMotion(false);
    const { container, text } = setup();
    expect(container.querySelector('.sr-only')?.textContent).toBe('Birinci satır');
    expect(text()?.getAttribute('aria-hidden')).toBe('true');
    // Kullanıcı kararı (12 Kas): görünür durdur düğmesi yok; ekran okuyucuyu sürekli duyuruyla da rahatsız etmeyiz.
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });

  it('satırlar sürekli döner ve sona gelince başa sarar', () => {
    stubReducedMotion(false);
    const { text } = setup();
    expect(text()?.textContent).toBe('Birinci satır');
    act(() => void vi.advanceTimersByTime(STEP));
    expect(text()?.textContent).toBe('İkinci satır');
    act(() => void vi.advanceTimersByTime(STEP));
    expect(text()?.textContent).toBe('Üçüncü satır');
    act(() => void vi.advanceTimersByTime(STEP));
    expect(text()?.textContent).toBe('Birinci satır');
  });

  it('fare bölgenin üstündeyken bekler, çekilince kaldığı yerden sürer', () => {
    stubReducedMotion(false);
    const { zone, text } = setup();
    act(() => void vi.advanceTimersByTime(STEP));
    expect(text()?.textContent).toBe('İkinci satır');
    fireEvent.mouseEnter(zone);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(text()?.textContent).toBe('İkinci satır');
    fireEvent.mouseLeave(zone);
    act(() => void vi.advanceTimersByTime(STEP));
    expect(text()?.textContent).toBe('Üçüncü satır');
  });

  it('klavye odağı bölgedeyken bekler; odak bölge içinde gezerken bekleme sürer, dışına çıkınca döner', () => {
    stubReducedMotion(false);
    const { getByTestId, text } = setup();
    const a = getByTestId('inside-a');
    const b = getByTestId('inside-b');
    fireEvent.focusIn(a);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(text()?.textContent).toBe('Birinci satır');
    // A → B: odak bölge içinde kaldı (relatedTarget içeride).
    fireEvent.focusOut(a, { relatedTarget: b });
    fireEvent.focusIn(b);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(text()?.textContent).toBe('Birinci satır');
    // B → dışarı.
    fireEvent.focusOut(b, { relatedTarget: document.body });
    act(() => void vi.advanceTimersByTime(STEP));
    expect(text()?.textContent).toBe('İkinci satır');
  });

  it('geçiş ortasında beklemeye girmek metni gizli bırakmaz; çıkınca da gizli takılmaz', () => {
    stubReducedMotion(false);
    const { zone, text } = setup();
    // 3,6 sn'de geçiş (soluklaşma) başlar; 0,26 sn bitmeden fare gelir.
    act(() => void vi.advanceTimersByTime(3650));
    expect(text()?.getAttribute('data-visible')).toBe('false');
    fireEvent.mouseEnter(zone);
    expect(text()?.getAttribute('data-visible')).toBe('true');
    fireEvent.mouseLeave(zone);
    expect(text()?.getAttribute('data-visible')).toBe('true');
    expect(text()?.textContent).toBe('Birinci satır');
  });

  it('hareket azaltma tercihinde hiç dönmez: ilk satır sabit', () => {
    stubReducedMotion(true);
    const { text } = setup();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(text()?.textContent).toBe('Birinci satır');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tek satır zamanlayıcı kurmaz; sökülünce zamanlayıcı kalmaz', () => {
    stubReducedMotion(false);
    const single = setup(['Tek']);
    expect(vi.getTimerCount()).toBe(0);
    single.unmount();
    const many = setup();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    many.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
