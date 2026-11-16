import { describe, expect, it } from 'vitest';

import { hasPersonalDataPattern } from '@/lib/personal-data';

import { letterMarker } from './markers';

// Eski işaretçi: `zr` + randomUUID()'in ilk 12 onaltılık karakteri (admin-panel-reviewer.db.test.ts, kart 392 öncesi).
const legacyMarker = (hex: string) => `zr${hex.slice(0, 12)}`;

describe('rastgele test işaretçisi ve kişisel veri süzgeci', () => {
  it('eski onaltılık işaretçi, rakam dizisi uzun düşünce telefon/kimlik süzgecine takılır (belirlenimci örnekler)', () => {
    // 10 haneli, 5 ile başlayan dizi: cep telefonu biçimi.
    expect(hasPersonalDataPattern(legacyMarker('5123456789ab'))).toBe(true);
    expect(hasPersonalDataPattern(`Kanonik ${legacyMarker('5123456789ab')}`)).toBe(true);
    // Tam 11 haneli dizi: kimlik numarası biçimi.
    expect(hasPersonalDataPattern(legacyMarker('12345678901a'))).toBe(true);
    // Aynı uzunlukta rakam azsa geçer; yani kırmızı tesadüfe bağlıydı.
    expect(hasPersonalDataPattern(legacyMarker('a1b2c3d4e5f6'))).toBe(false);
  });

  it('harf işaretçisi rakam içermez, ön eki ve uzunluğu korur', () => {
    const marker = letterMarker('zr', 12);
    expect(marker).toMatch(/^zr[a-z]{12}$/);
    expect(letterMarker()).toMatch(/^[a-z]{10}$/);
    expect(letterMarker('x', 0)).toBe('x');
  });

  it('10 000 üretimde süzgeç hiç ret vermez ve işaretçiler benzersizdir', () => {
    const seen = new Set<string>();
    let rejected = 0;
    for (let index = 0; index < 10_000; index += 1) {
      const marker = letterMarker('zr', 12);
      seen.add(marker);
      if (hasPersonalDataPattern(marker) || hasPersonalDataPattern(`Özel beceri ${marker}`))
        rejected += 1;
    }
    expect(rejected).toBe(0);
    expect(seen.size).toBe(10_000);
  });
});
