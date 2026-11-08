import { REPORT_MIN_GROUP_SIZE } from '@/contracts/admin';

/**
 * Mezun istihdam raporunun saf kuralları (P1-11; `EMPLOYMENT_COUNTING_RULE`): bir mezunu temsil eden pozisyonu
 * seçmek ve küçük grupları bastırmak. Veritabanına dokunmaz.
 */

export type PositionFacts = {
  id: string;
  isCurrent: boolean;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  companyId: string | null;
  titleId: string | null;
  /** Pozisyonun kendi sektörü; yoksa şirketin sektörü (çağıran birleştirir). */
  sectorId: string | null;
};

const monthIndex = (year: number | null, month: number | null): number =>
  year === null ? Number.NEGATIVE_INFINITY : year * 12 + (month ?? 1);

/**
 * Kişiyi temsil eden pozisyon: güncel (`isCurrent`) olanlardan en son başlayan; güncel yoksa en son biten
 * (bitişi bilinmeyen en eski sayılır, ardından en son başlayan). Eşitlikte kimlik büyük olan: sonuç sıradan
 * bağımsız ve tekrarlanabilirdir.
 */
export function pickRepresentativePosition<T extends PositionFacts>(
  positions: readonly T[],
): T | null {
  const current = positions.filter((position) => position.isCurrent);
  const pool = current.length > 0 ? current : positions;
  let best: T | null = null;
  for (const position of pool) {
    if (best === null || compare(position, best, current.length > 0) > 0) best = position;
  }
  return best;
}

function compare(a: PositionFacts, b: PositionFacts, currentOnly: boolean): number {
  const keys = currentOnly
    ? [monthIndex(a.startYear, a.startMonth) - monthIndex(b.startYear, b.startMonth)]
    : [
        monthIndex(a.endYear, a.endMonth) - monthIndex(b.endYear, b.endMonth),
        monthIndex(a.startYear, a.startMonth) - monthIndex(b.startYear, b.startMonth),
      ];
  for (const key of keys) {
    if (Number.isNaN(key)) continue; // -∞ − (−∞)
    if (key !== 0) return key;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type RawGroup = {
  /** Sözlük kaydı kimliği; `null` = sözlükte eşleşmeyen / bilinmeyen. */
  key: string | null;
  label: string | null;
  count: number;
};
export type EmploymentBucket = {
  type: 'NAMED' | 'UNKNOWN' | 'OTHER';
  label: string | null;
  count: number;
};

/**
 * Küçük hücre bastırma. `minSize` ve üstü gruplar kendi adıyla görünür; altındakiler (bilinmeyen dahil)
 * `OTHER`'da birleşir, o da eşiğin altındaysa hiç gösterilmez. Sıra: büyükten küçüğe (eşitte ad), sonra
 * `UNKNOWN`, en sonda `OTHER` — sıra bastırılan grup hakkında ipucu vermez.
 *
 * Sınır: gösterilen kovalar toplamı ile `alumniWithPosition` farkı bastırılan grupların toplamını verir (en
 * fazla 2'lik tek bir `OTHER` bile bu farktan çıkarılabilir). Kişi kimliği ya da kovası bu farktan çıkmaz;
 * pilot ölçeğinde kabul edilen ve raporda belgelenen sınırdır.
 */
export function buildBuckets(
  groups: readonly RawGroup[],
  minSize: number = REPORT_MIN_GROUP_SIZE,
): EmploymentBucket[] {
  const named: EmploymentBucket[] = [];
  let unknown = 0;
  let other = 0;
  for (const group of groups) {
    if (group.count <= 0) continue;
    if (group.key === null) unknown += group.count;
    else if (group.count >= minSize)
      named.push({ type: 'NAMED', label: group.label ?? '', count: group.count });
    else other += group.count;
  }
  named.sort((a, b) => b.count - a.count || (a.label ?? '').localeCompare(b.label ?? '', 'tr-TR'));
  const result = [...named];
  if (unknown >= minSize) result.push({ type: 'UNKNOWN', label: null, count: unknown });
  else other += unknown;
  if (other >= minSize) result.push({ type: 'OTHER', label: null, count: other });
  return result;
}
