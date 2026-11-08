import type { SuspicionRule } from '@/contracts/points';

/**
 * Şüphe taraması kuralları (saf; K-11 eşikleri). İşaret CEZA DEĞİLDİR: sistem yöneticisi karar verir. Girdi, tek
 * kullanıcının geri alınmamış, puanı > 0 olan kayıtlarıdır; çıktı işaretin dayandığı kayıt kimlikleri ve sayılardır
 * (kişisel veri yok). Eşikler bilinçli olarak sabittir; değiştirmek kod + karar kaydı ister.
 */

export const SUSPICION_THRESHOLDS = {
  /** BURST: kayan pencerede bu puan ve üstü. */
  burstPoints: 40,
  burstWindowHours: 24,
  /** SINGLE_COUNTERPART: pencere, toplam puan tabanı, o karşı taraftan en az kayıt, pay (yüzde). */
  counterpartWindowDays: 90,
  counterpartMinTotalPoints: 15,
  counterpartMinEntries: 3,
  counterpartSharePercent: 60,
  /** SYNC_FEEDBACK: iki tarafın yanıtı arası en çok bu kadar ms; aynı ikilide en az bu kadar görüşme; pencere. */
  syncGapMs: 60_000,
  syncMinSessions: 3,
  syncWindowDays: 180,
} as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type ScanEntry = {
  id: string;
  points: number;
  eventAt: Date;
  counterpartId: string | null;
};

export type SuspicionFinding = {
  rule: SuspicionRule;
  entryIds: string[];
  windowStart: Date;
  windowEnd: Date;
  points: number;
  sharePercent: number | null;
  syncedCount: number | null;
};

const byTime = (a: ScanEntry, b: ScanEntry) =>
  a.eventAt.getTime() - b.eventAt.getTime() || a.id.localeCompare(b.id);

/** En çok puanlı kayan pencere (eşitlikte en erken). Pencere [başlangıç, başlangıç + 24 saat). */
export function detectBurst(entries: readonly ScanEntry[]): SuspicionFinding | null {
  const sorted = entries.filter((e) => e.points > 0).sort(byTime);
  const span = SUSPICION_THRESHOLDS.burstWindowHours * HOUR;
  let best: ScanEntry[] = [];
  let bestSum = 0;
  sorted.forEach((first, index) => {
    const window: ScanEntry[] = [];
    for (const entry of sorted.slice(index)) {
      if (entry.eventAt.getTime() - first.eventAt.getTime() >= span) break;
      window.push(entry);
    }
    const sum = window.reduce((total, e) => total + e.points, 0);
    if (sum > bestSum) {
      best = window;
      bestSum = sum;
    }
  });
  if (bestSum < SUSPICION_THRESHOLDS.burstPoints) return null;
  return {
    rule: 'BURST',
    entryIds: best.map((e) => e.id),
    ...spanOf(best.map((e) => e.eventAt)),
    points: bestSum,
    sharePercent: null,
    syncedCount: null,
  };
}

/** Tarih kümesinin [en erken, en geç] penceresi. */
function spanOf(dates: readonly Date[]): { windowStart: Date; windowEnd: Date } {
  const times = dates.map((d) => d.getTime());
  return { windowStart: new Date(Math.min(...times)), windowEnd: new Date(Math.max(...times)) };
}

/** Son 90 günde puanın büyük kısmı tek karşı taraftan (toplam taban, en az kayıt ve pay eşiği birlikte). */
export function detectSingleCounterpart(
  entries: readonly ScanEntry[],
  now: Date,
): SuspicionFinding | null {
  const t = SUSPICION_THRESHOLDS;
  const from = now.getTime() - t.counterpartWindowDays * DAY;
  const recent = entries
    .filter(
      (e) => e.points > 0 && e.eventAt.getTime() > from && e.eventAt.getTime() <= now.getTime(),
    )
    .sort(byTime);
  const total = recent.reduce((sum, e) => sum + e.points, 0);
  if (total < t.counterpartMinTotalPoints) return null;
  const perCounterpart = new Map<string, ScanEntry[]>();
  for (const entry of recent) {
    if (!entry.counterpartId) continue;
    perCounterpart.set(entry.counterpartId, [
      ...(perCounterpart.get(entry.counterpartId) ?? []),
      entry,
    ]);
  }
  let top: ScanEntry[] | null = null;
  let topPoints = 0;
  for (const group of perCounterpart.values()) {
    const points = group.reduce((sum, e) => sum + e.points, 0);
    if (points > topPoints) {
      top = group;
      topPoints = points;
    }
  }
  if (!top || top.length < t.counterpartMinEntries) return null;
  const sharePercent = Math.floor((topPoints * 100) / total);
  if (sharePercent < t.counterpartSharePercent) return null;
  return {
    rule: 'SINGLE_COUNTERPART',
    entryIds: top.map((e) => e.id),
    ...spanOf(top.map((e) => e.eventAt)),
    points: topPoints,
    sharePercent,
    syncedCount: null,
  };
}

export type SyncSession = {
  entryId: string;
  counterpartId: string;
  eventAt: Date;
  mentorFeedbackAt: Date;
  menteeFeedbackAt: Date;
};

/** Aynı ikilide iki tarafın yanıtı tekrar tekrar aynı dakikada (≤ 60 sn): en çok eşleşen ikili işaretlenir. */
export function detectSyncFeedback(
  sessions: readonly SyncSession[],
  now: Date,
  pointsOf: (entryId: string) => number,
): SuspicionFinding | null {
  const t = SUSPICION_THRESHOLDS;
  const from = now.getTime() - t.syncWindowDays * DAY;
  const perPair = new Map<string, SyncSession[]>();
  for (const s of sessions) {
    const gap = Math.abs(s.mentorFeedbackAt.getTime() - s.menteeFeedbackAt.getTime());
    if (gap > t.syncGapMs || s.eventAt.getTime() <= from || s.eventAt.getTime() > now.getTime())
      continue;
    perPair.set(s.counterpartId, [...(perPair.get(s.counterpartId) ?? []), s]);
  }
  let top: SyncSession[] | null = null;
  for (const group of perPair.values()) {
    if (group.length >= t.syncMinSessions && (!top || group.length > top.length)) top = group;
  }
  if (!top) return null;
  const ordered = [...top].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
  return {
    rule: 'SYNC_FEEDBACK',
    entryIds: ordered.map((s) => s.entryId),
    ...spanOf(ordered.map((s) => s.eventAt)),
    points: ordered.reduce((sum, s) => sum + pointsOf(s.entryId), 0),
    sharePercent: null,
    syncedCount: ordered.length,
  };
}

/** Referans iddiaları: 180 günde aynı öğrenciye üç veya 24 saatte toplam beş onay işaretlenir.
 * Sıfır çarpanlı kayıtlar da sayılır; eşik puan verilmesini veya yaptırımı tek başına belirlemez. */
export function detectReferralPatterns(
  entries: readonly ScanEntry[],
  now: Date,
): SuspicionFinding[] {
  const recent = entries
    .filter((e) => e.eventAt <= now && e.eventAt.getTime() > now.getTime() - 180 * DAY)
    .sort(byTime);
  const groups = new Map<string, ScanEntry[]>();
  for (const entry of recent)
    if (entry.counterpartId)
      groups.set(entry.counterpartId, [...(groups.get(entry.counterpartId) ?? []), entry]);
  const result: SuspicionFinding[] = [];
  const repeated = [...groups.values()]
    .filter((g) => g.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  const finding = (
    rule: 'REFERRAL_REPEAT' | 'REFERRAL_BURST',
    group: ScanEntry[],
  ): SuspicionFinding => ({
    rule,
    entryIds: group.map((e) => e.id),
    ...spanOf(group.map((e) => e.eventAt)),
    points: group.reduce((sum, e) => sum + e.points, 0),
    sharePercent: null,
    syncedCount: null,
  });
  if (repeated) result.push(finding('REFERRAL_REPEAT', repeated));
  let best: ScanEntry[] = [];
  recent.forEach((first, index) => {
    const window = recent
      .slice(index)
      .filter((e) => e.eventAt.getTime() - first.eventAt.getTime() < DAY);
    if (window.length > best.length) best = window;
  });
  if (best.length >= 5) result.push(finding('REFERRAL_BURST', best));
  return result;
}
