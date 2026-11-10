import { describe, expect, it } from 'vitest';

import { hasSparkle, isPinkishAccent, rgbOf } from './ai-traces';

describe('ai-traces (saf işlevler)', () => {
  it('hasSparkle: süs yıldızı/ışıltı karakterlerini yakalar, düz metni yakalamaz', () => {
    for (const mark of ['✳', '✦', '✧', '✨', '⭐', '★', '☆', '❇', '❈', '✴', '✵', '⚡'])
      expect(hasSparkle(`Merhaba ${mark} dünya`), mark).toBe(true);
    expect(hasSparkle('Staj ararken yalnız değilsin. → ‹ › · …')).toBe(false);
    expect(hasSparkle('')).toBe(false);
  });

  it('rgbOf: #rrggbb ayrıştırır, geçersizi reddeder', () => {
    expect(rgbOf('#ff6b7f')).toEqual([255, 107, 127]);
    expect(rgbOf('FF6B7F')).toEqual([255, 107, 127]);
    expect(rgbOf('#fff')).toBeNull();
    expect(rgbOf('#gg0000')).toBeNull();
  });

  it('isPinkishAccent: mercan-pembe geçer, Claude turuncusu ve eski mercan geçmez', () => {
    expect(isPinkishAccent('#ff6b7f')).toBe(true);
    expect(isPinkishAccent('#d97757')).toBe(false);
    expect(isPinkishAccent('#ff7a59')).toBe(false);
    expect(isPinkishAccent('#5b5bf6')).toBe(false);
    expect(isPinkishAccent('geçersiz')).toBe(false);
  });
});
