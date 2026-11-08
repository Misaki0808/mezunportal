import { describe, expect, it } from 'vitest';

import { REPORT_MIN_GROUP_SIZE } from '@/contracts/admin';

import {
  buildBuckets,
  pickRepresentativePosition,
  type PositionFacts,
  type RawGroup,
} from './employmentReport';

const position = (id: string, patch: Partial<PositionFacts> = {}): PositionFacts => ({
  id,
  isCurrent: false,
  startYear: null,
  startMonth: null,
  endYear: null,
  endMonth: null,
  companyId: null,
  titleId: null,
  sectorId: null,
  ...patch,
});

describe('pickRepresentativePosition', () => {
  it('pozisyon yoksa null', () => {
    expect(pickRepresentativePosition([])).toBeNull();
  });

  it('güncel pozisyon, daha yeni bitmiş olandan önce gelir; birden çok güncelde en son başlayan', () => {
    const picked = pickRepresentativePosition([
      position('eski-bitmis', { endYear: 2025, endMonth: 12, startYear: 2024 }),
      position('guncel-a', { isCurrent: true, startYear: 2020 }),
      position('guncel-b', { isCurrent: true, startYear: 2023, startMonth: 3 }),
    ]);
    expect(picked?.id).toBe('guncel-b');
  });

  it('güncel yoksa en son biten; bitişi bilinmeyen en eski sayılır', () => {
    expect(
      pickRepresentativePosition([
        position('a', { endYear: 2022, endMonth: 6 }),
        position('b', { endYear: 2023, endMonth: 1 }),
        position('c', { endYear: null }),
      ])?.id,
    ).toBe('b');
    expect(
      pickRepresentativePosition([
        position('x', { startYear: 2019 }),
        position('y', { startYear: 2021 }),
      ])?.id,
    ).toBe('y');
  });

  it('ay yoksa yılın başı sayılır; eşitlikte kimlik büyük olan seçilir ve sıra sonucu değiştirmez', () => {
    const a = position('a', { endYear: 2023 });
    const b = position('b', { endYear: 2023, endMonth: 1 });
    expect(pickRepresentativePosition([a, b])?.id).toBe('b');
    expect(pickRepresentativePosition([b, a])?.id).toBe('b');
  });
});

describe('buildBuckets (küçük hücre bastırma)', () => {
  const group = (key: string | null, count: number, label = key): RawGroup => ({
    key,
    label,
    count,
  });

  it('eşik 3: 2 kişilik grup tek başına görünmez, 3 kişilik görünür', () => {
    expect(REPORT_MIN_GROUP_SIZE).toBe(3);
    expect(buildBuckets([group('a', 3, 'A'), group('b', 2, 'B')])).toEqual([
      { type: 'NAMED', label: 'A', count: 3 },
    ]);
  });

  it('küçük gruplar OTHER’da birleşir; birleşim 3 ve üstüyse görünür, altındaysa hiç yok', () => {
    expect(buildBuckets([group('a', 2, 'A'), group('b', 1, 'B')])).toEqual([
      { type: 'OTHER', label: null, count: 3 },
    ]);
    expect(buildBuckets([group('a', 2, 'A'), group('b', 5, 'B')])).toEqual([
      { type: 'NAMED', label: 'B', count: 5 },
    ]);
    expect(buildBuckets([group('a', 1, 'A')])).toEqual([]);
  });

  it('bilinmeyen: yeterliyse UNKNOWN, küçükse OTHER’a katılır', () => {
    expect(buildBuckets([group(null, 4, null), group('a', 3, 'A')])).toEqual([
      { type: 'NAMED', label: 'A', count: 3 },
      { type: 'UNKNOWN', label: null, count: 4 },
    ]);
    expect(buildBuckets([group(null, 2, null), group('a', 1, 'A')])).toEqual([
      { type: 'OTHER', label: null, count: 3 },
    ]);
  });

  it('sıra: büyükten küçüğe, eşitte Türkçe ada göre; UNKNOWN sonra OTHER en sonda', () => {
    const buckets = buildBuckets([
      group('i', 3, 'Işık'),
      group('c', 3, 'Çelik'),
      group('z', 7, 'Zeta'),
      group(null, 3, null),
      group('s1', 2, 'S1'),
      group('s2', 1, 'S2'),
    ]);
    expect(buckets.map((bucket) => bucket.label ?? bucket.type)).toEqual([
      'Zeta',
      'Çelik',
      'Işık',
      'UNKNOWN',
      'OTHER',
    ]);
  });

  it('hiçbir kovanın sayısı eşiğin altında değildir (rastgele girdilerle)', () => {
    for (let round = 0; round < 200; round += 1) {
      const groups = Array.from({ length: 1 + (round % 9) }, (_, index) =>
        group(
          index === 0 && round % 3 === 0 ? null : `g${index}`,
          (round * (index + 3)) % 6,
          `G${index}`,
        ),
      );
      for (const bucket of buildBuckets(groups))
        expect(bucket.count).toBeGreaterThanOrEqual(REPORT_MIN_GROUP_SIZE);
    }
  });

  it('sayısı sıfır/negatif gruplar yok sayılır', () => {
    expect(buildBuckets([group('a', 0, 'A'), group('b', -4, 'B')])).toEqual([]);
  });
});
