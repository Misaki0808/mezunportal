import { describe, expect, it } from 'vitest';
import { compareTurkish, sortByTurkishName } from './turkish-sort';

describe('Türkçe sıralama', () => {
  it('ç, ğ, ı/i, ö, ş, ü harfleri alfabedeki yerine oturur (kod noktası sırasına değil)', () => {
    const names = [
      'Zeynep',
      'Şule',
      'Ümit',
      'Ömer',
      'Işık',
      'İpek',
      'Gül',
      'Ğ. Ali',
      'Çağla',
      'Cem',
      'Ayşe',
    ];
    expect(sortByTurkishName(names.map((name) => ({ name })))).toEqual(
      [
        'Ayşe',
        'Cem',
        'Çağla',
        'Gül',
        'Ğ. Ali',
        'Işık',
        'İpek',
        'Ömer',
        'Şule',
        'Ümit',
        'Zeynep',
      ].map((name) => ({ name })),
    );
    expect(['Zeynep', 'Çağla'].sort()).toEqual(['Zeynep', 'Çağla']); // varsayılan sıra Türkçeyi bilmez
    expect(compareTurkish('Çağla', 'Zeynep')).toBeLessThan(0);
  });
  it('eşit adlarda girdi sırasını korur ve girdiyi değiştirmez', () => {
    const rows = [
      { name: 'Aynı', id: 'b' },
      { name: 'Aynı', id: 'a' },
    ];
    expect(sortByTurkishName(rows).map((row) => row.id)).toEqual(['b', 'a']);
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
