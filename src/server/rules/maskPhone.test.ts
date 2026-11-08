import { describe, expect, it } from 'vitest';

import { maskPhone } from './maskPhone';

describe('maskPhone', () => {
  it.each([
    ['05321234567', '*** *** ** 67'],
    ['0532 123 45 67', '*** *** ** 67'],
    ['+90 (532) 123-45-67', '*** *** ** 67'],
    ['5321234567', '*** *** ** 67'],
    ['1234', '*** *** ** 34'],
    ['123', '***'],
    ['', '***'],
    ['abc', '***'],
  ])('%j → %j', (phone, masked) => {
    expect(maskPhone(phone)).toBe(masked);
  });

  it('maskeli çıktı son iki rakamdan fazlasını sızdırmaz', () => {
    const masked = maskPhone('05329876543');
    expect(masked.replace(/\D/g, '')).toBe('43');
    for (const part of ['0532', '532', '987', '9876', '65']) expect(masked).not.toContain(part);
  });

  it('rastgele numaralarda ham numarayı hiçbir zaman içermez', () => {
    for (let index = 0; index < 200; index += 1) {
      const digits = String(Math.floor(5_000_000_000 + Math.random() * 999_999_999));
      const masked = maskPhone(`0${digits}`);
      expect(masked).not.toContain(digits.slice(0, 8));
      expect(masked.replace(/\D/g, '')).toBe(digits.slice(-2));
    }
  });
});
