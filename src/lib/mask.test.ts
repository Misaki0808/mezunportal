import { describe, expect, it } from 'vitest';

import { maskEmail, maskPersonalData, maskPhone } from './mask';

describe('maskEmail', () => {
  it.each([
    ['ayse.yilmaz@ogr.iu.edu.tr', 'a***@o***.edu.tr'],
    ['mehmet@gmail.com', 'm***@gmail.com'],
    ['x@a.co', 'x***@a.co'],
    ['bozuk', '***'],
    ['@iu.edu.tr', '***'],
  ])('%s → %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });
});

describe('maskPhone', () => {
  it.each([
    '+90 532 123 45 67',
    '0532 123 45 67',
    '05321234567',
    '+905321234567',
    '(0532) 123-45-67',
  ])('%s → yalnız son iki rakam', (input) => {
    const masked = maskPhone(input);
    expect(masked).toBe('+90 5** *** ** 67');
    expect(masked).not.toContain('123');
  });
});

describe('maskPersonalData (log)', () => {
  it('metindeki e-posta ve telefonları maskeler, geri kalanı korur', () => {
    const line = 'Talep: Ayşe <ayse.yilmaz@ogr.iu.edu.tr>, tel 0532 123 45 67; kimlik 0195f3a2';
    const masked = maskPersonalData(line);
    expect(masked).not.toContain('ayse.yilmaz');
    expect(masked).not.toContain('123 45');
    expect(masked).toContain('Talep: Ayşe');
    expect(masked).toContain('kimlik 0195f3a2');
  });

  it('rastgele üretilmiş e-posta ve telefonlar ham kalmaz', () => {
    for (let i = 0; i < 200; i += 1) {
      const local = Math.random().toString(36).slice(2, 10);
      const phone = `05${Math.floor(10 + Math.random() * 89)} ${Math.floor(100 + Math.random() * 899)} ${Math.floor(10 + Math.random() * 89)} ${Math.floor(10 + Math.random() * 89)}`;
      const out = maskPersonalData(`e: ${local}@ornek.edu.tr t: ${phone}`);
      expect(out).not.toContain(local);
      expect(out).not.toContain(phone);
    }
  });
});
