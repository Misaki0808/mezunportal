import 'server-only';

import {
  EVENT_RETENTION_MONTHS,
  PROFILE_THRESHOLDS,
  eventInputSchema,
  type EventInput,
} from '@/contracts/metrics';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import {
  crossedThresholds,
  pickEventSubject,
  type EventSubject,
  type MembershipFacts,
} from '../rules/eventSubject';

/**
 * Kullanım olayı yazımı (P1-13). `props` yalnız sözleşmedeki strict şemalardan geçer (kişisel veri alanı yoktur);
 * veritabanı CHECK'i ek ağdır. `emitEvent` istek yolunu YAVAŞLATMAZ ve hatası kullanıcı akışını BOZMAZ: işi başlatır, beklemez,
 * hatayı yutar. Olay yazımı işlem (transaction) içinden YAPILMAZ: başarısız bir ekleme açık işlemi bozardı; çağıranlar
 * işlem tamamlandıktan sonra yayar.
 */
export type EventDb = Pick<PrismaClient, 'event' | 'membership'>;

/** Bekleyen yazımlar (testler ve düzgün kapanış `settleEvents` ile bekler). */
const pending = new Set<Promise<unknown>>();
export async function settleEvents(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

export async function subjectOf(
  db: Pick<PrismaClient, 'membership'>,
  userId: string,
): Promise<EventSubject | null> {
  const memberships = await db.membership.findMany({
    where: { userId, endedAt: null, verificationStatus: 'VERIFIED' },
    select: { role: true, departmentId: true, verificationStatus: true, endedAt: true },
  });
  return pickEventSubject(memberships);
}

/** Doğrulanmış olayı yazar; geçersiz `props` programcı hatasıdır ve fırlatır (üretimde `emitEvent` yutar). */
export async function recordEvent(
  db: EventDb,
  userId: string | null,
  input: EventInput,
  subject?: EventSubject | null,
): Promise<void> {
  const parsed = eventInputSchema.parse(input) as EventInput;
  const owner = subject !== undefined ? subject : userId ? await subjectOf(db, userId) : null;
  await db.event.create({
    data: {
      type: parsed.type,
      userId,
      role: owner?.role ?? null,
      departmentId: owner?.departmentId ?? null,
      props: parsed.props as Prisma.InputJsonValue,
    },
  });
}

/** Etkin oturumdaki aktörden olay sahibi (ek sorgu yok). */
export function subjectFromActor(actor: {
  facts: { memberships: readonly MembershipFacts[] };
}): EventSubject | null {
  return pickEventSubject(actor.facts.memberships);
}

/** Kullanılan süzgeç TÜRLERİ (değerler asla): tanımlı ve boş olmayan alan adları. */
export function usedFilterKeys<K extends string>(
  filter: Record<string, unknown>,
  keys: readonly K[],
): K[] {
  return keys.filter((key) => {
    const value = filter[key];
    return (
      value !== undefined &&
      value !== null &&
      value !== false &&
      !(Array.isArray(value) && value.length === 0)
    );
  });
}

/** Ateşle-ve-unut: asla fırlatmaz, beklenmez. */
export function emitEvent(
  db: EventDb,
  userId: string | null,
  input: EventInput,
  subject?: EventSubject | null,
): void {
  const work = recordEvent(db, userId, input, subject).catch(() => undefined);
  pending.add(work);
  void work.finally(() => pending.delete(work));
}

/**
 * Profil tamamlama eşiklerini yukarı yönlü geçişte BİR KEZ yayar (kullanıcı başına eşik başına). Çağıran işlem bittikten
 * sonra çağırır; önceki ve yeni yüzde profil yazımından gelir.
 */
export function emitProfileThresholds(
  db: EventDb,
  userId: string,
  before: number,
  after: number,
): void {
  for (const threshold of crossedThresholds(before, after, PROFILE_THRESHOLDS)) {
    const work = (async () => {
      const exists = await db.event.count({
        where: {
          userId,
          type: 'PROFILE_THRESHOLD',
          props: { path: ['threshold'], equals: threshold },
        },
      });
      if (exists === 0)
        await recordEvent(db, userId, {
          type: 'PROFILE_THRESHOLD',
          props: { threshold: threshold as 50 | 80 | 100 },
        });
    })().catch(() => undefined);
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }
}

/** 24 aydan eski olayları kullanıcıdan koparır (userId → null); sayılar kalır. Tekrar çalıştırılabilir. */
export async function detachOldEvents(db: Pick<PrismaClient, 'event'>, now: Date): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - EVENT_RETENTION_MONTHS);
  const result = await db.event.updateMany({
    where: { userId: { not: null }, createdAt: { lt: cutoff } },
    data: { userId: null },
  });
  return result.count;
}
