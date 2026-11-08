import type { PointAction, PointStatus } from '@/contracts/points';

import { monthKey } from './appointmentSlots';

/**
 * Puan kuralları (saf; docs/architecture.md "Puan motoru ve hile önleme", K-10, K-11). Veritabanı, saat ve rastgelelik
 * yok: hepsi tablo-güdümlü testlidir. Servis (`services/points.ts`) bunları uygular.
 *
 * - Puan = taban × çarpan / 100, kesir aşağı yuvarlanır.
 * - Görüşmede ÇARPAN: aynı mentor–öğrenci ikilisi için aynı İstanbul takvim ayında başka puanlı görüşme varsa 0
 *   (ikili tavanı; sıradan bağımsız: ay içinde ilk yazılan puan alır); yoksa son 180 gündeki ÖNCEKİ puanlı
 *   görüşme sayısına göre 100 → 50 → 25 (azalan puan).
 * - Gecikmeli eylem (`delayDays` > 0): olaydan `delayDays` gün sonra kesinleşir; o zamana dek `PENDING`.
 */

const DAY = 24 * 60 * 60 * 1000;

export const DECAY_WINDOW_DAYS = 180;
/** 0, 1, 2+ önceki puanlı görüşme için çarpan (yüzde): 1 → 0,5 → 0,25. */
export const DECAY_STEPS = { none: 100, one: 50, twoOrMore: 25 } as const;

export function pointsOf(basePoints: number, multiplierPercent: number): number {
  if (!Number.isInteger(basePoints) || basePoints < 0) throw new RangeError('invalid base points');
  if (!Number.isInteger(multiplierPercent) || multiplierPercent < 0 || multiplierPercent > 100)
    throw new RangeError('invalid multiplier');
  return Math.floor((basePoints * multiplierPercent) / 100);
}

/**
 * Görüşme çarpanı (yüzde). `scored`: aynı ikilinin bu görüşme DIŞINDA, geri alınmamış ve çarpanı > 0 olan görüşmelerinin
 * olay anları (sırasız). Ay içinde başka puanlı görüşme varsa 0; yoksa bu görüşmeden ÖNCE ve 180 günden yakın olanlara göre azalır.
 */
export function sessionMultiplierPercent(eventAt: Date, scored: readonly Date[]): number {
  const month = monthKey(eventAt);
  if (scored.some((at) => monthKey(at) === month)) return 0;
  const windowStart = eventAt.getTime() - DECAY_WINDOW_DAYS * DAY;
  const earlier = scored.filter(
    (at) => at.getTime() < eventAt.getTime() && at.getTime() > windowStart,
  ).length;
  if (earlier === 0) return DECAY_STEPS.none;
  return earlier === 1 ? DECAY_STEPS.one : DECAY_STEPS.twoOrMore;
}

/** Kayıt durumu: gecikmesiz ya da gecikmesi çoktan dolmuş olay `FINAL`, aksi `PENDING`. */
export function awardStatus(
  delayDays: number,
  eventAt: Date,
  now: Date,
): { status: Extract<PointStatus, 'PENDING' | 'FINAL'>; finalizesAt: Date | null } {
  if (!Number.isInteger(delayDays) || delayDays < 0) throw new RangeError('invalid delay');
  if (delayDays === 0) return { status: 'FINAL', finalizesAt: null };
  const finalizesAt = new Date(eventAt.getTime() + delayDays * DAY);
  return { status: finalizesAt.getTime() <= now.getTime() ? 'FINAL' : 'PENDING', finalizesAt };
}

export function sessionActionFor(mode: 'ONLINE' | 'IN_PERSON'): PointAction {
  return mode === 'ONLINE' ? 'SESSION_ONLINE' : 'SESSION_IN_PERSON';
}

/**
 * İki taraf şartı: randevu `COMPLETED` VE hem mentor hem öğrenci "gerçekleşti" demiş. (Durum geçişi bunu zaten
 * yapar; kural bağımsız ikinci güvence olarak puandan önce yeniden denetler.)
 */
export function bothSidesConfirmed(
  status: string,
  feedbacks: readonly { authorId: string; happened: boolean }[],
  mentorId: string,
  menteeId: string,
): boolean {
  if (status !== 'COMPLETED' || mentorId === menteeId) return false;
  const said = (id: string) => feedbacks.some((f) => f.authorId === id && f.happened);
  return said(mentorId) && said(menteeId);
}

/**
 * Kurucu üye etiketi (K-10): pilot süresince ilk yayınlanan deneyim. ANONİM deneyim etiket doğurmaz (etiket herkese
 * görünür; anonimlik yazar bağını sızdırmamalı). `until` boşsa pilot açıktır.
 */
export function isFoundingEligible(input: {
  anonymous: boolean;
  publishedAt: Date;
  until: Date | null;
}): boolean {
  if (input.anonymous) return false;
  return input.until === null || input.publishedAt.getTime() <= input.until.getTime();
}
