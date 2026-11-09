import { expect, it } from 'vitest';
import { calculateSkillGap } from './skillGap';
const dictionary = ['sql', 'excel', 'hidden', 'common'].map((id) => ({ id, label: id }));
function people(n: number, have: number) {
  return Array.from({ length: n }, (_, i) => (i < have ? ['sql'] : []));
}
it.each([10, 11, 12])(
  '%i kişide her sahip/sahip değil sınırı güvenli çıktı veya tamamen gizli',
  (n) => {
    for (let count = 0; count <= n; count++) {
      const result = calculateSkillGap(people(n, count), [], [dictionary[0]!]);
      if (count < 5 || n - count < 5) expect(result).toBeNull();
      else
        expect(result).toEqual({
          band: '10+',
          progress: 0,
          missing: [{ id: 'sql', label: 'sql', percent: Math.round((20 * count) / n) * 5 }],
        });
    }
  },
);
it('öğrenci kümesini tüm kombinasyonlarla değiştirince kalan yüzdeler sabit, gizli/tamamlayıcı satır etkisiz', () => {
  const rows = Array.from({ length: 12 }, (_, i) => [
    ...(i < 5 ? ['sql'] : []),
    ...(i < 6 ? ['excel'] : []),
    ...(i < 4 ? ['hidden'] : []),
    ...(i < 11 ? ['common'] : []),
  ]);
  for (let mask = 0; mask < 16; mask++) {
    const owned = dictionary.filter((_, i) => mask & (1 << i)).map((x) => x.id),
      result = calculateSkillGap(rows, owned, dictionary)!;
    expect(result.band).toBe('10+');
    expect(result.missing).toEqual(
      [
        { id: 'excel', label: 'excel', percent: 50 },
        { id: 'sql', label: 'sql', percent: 40 },
      ].filter((x) => !owned.includes(x.id)),
    );
    expect(result.progress).toBe(50 * owned.filter((x) => x === 'sql' || x === 'excel').length);
    expect(JSON.stringify(result)).not.toMatch(/hidden|common|count|total/);
  }
});
it('ilk on: yüzde azalan, eşitlikte ad sırası; gizli satırlar sıralamaya ve paydaya girmez', () => {
  const dict = Array.from({ length: 12 }, (_, i) => ({
      id: 's' + i,
      label: 'Beceri ' + String(i).padStart(2, '0'),
    })),
    rows = Array.from({ length: 20 }, (_, i) =>
      dict.filter((_, j) => i < (j === 0 ? 4 : 5 + (j % 5))).map((x) => x.id),
    );
  const result = calculateSkillGap(rows, [], dict)!;
  expect(result.missing).toHaveLength(10);
  expect(result.missing.some((x) => x.id === 's0')).toBe(false);
  expect(result.missing).toEqual(
    [...result.missing].sort(
      (a, b) => b.percent - a.percent || a.label.localeCompare(b.label, 'tr-TR'),
    ),
  );
  expect(result.progress).toBe(0);
});
