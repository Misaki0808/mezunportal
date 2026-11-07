import { describe, expect, it } from 'vitest';

import { maskEmail } from './maskEmail';

describe('maskEmail', () => {
  it.each([
    ['ayse@ogr.iu.edu.tr', 'a***@o***.iu.edu.tr'],
    ['b@gmail.com', 'b***@g***.com'],
    ['uzun.kullanici@sirket.example.org', 'u***@s***.example.org'],
    ['yerel@tek', 't***'.replace('t***', 'y***@t***')],
    ['gecersiz', '***'],
    ['@x.com', '***'],
    ['a@', '***'],
    ['', '***'],
  ])('%j → %j', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it('maskeli çıktı yerel kısmın ve alan adının ilk harfinden fazlasını sızdırmaz', () => {
    const masked = maskEmail('mahrem.kisi@ozelalan.com.tr');
    expect(masked).not.toContain('mahrem');
    expect(masked).not.toContain('kisi');
    expect(masked).not.toContain('ozelalan');
    expect(masked).toBe('m***@o***.com.tr');
  });
});
