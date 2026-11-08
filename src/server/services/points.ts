import 'server-only';

import {
  getMyContributionSchema,
  SESSION_POINT_ACTIONS,
  type ContributionOverview,
  type GetMyContributionInput,
  type PointAction,
  type PointEntryView,
  type PointSourceType,
} from '@/contracts/points';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { getPointsEnv } from '@/lib/env';

import { accountStatusOf } from '../rules/authorization';
import {
  awardStatus,
  bothSidesConfirmed,
  isFoundingEligible,
  pointsOf,
  sessionActionFor,
  sessionMultiplierPercent,
} from '../rules/points';
import { idCursorWhere, toPage } from './admin-access';

/**
 * Puan motoru çekirdeği (P1-16; docs/architecture.md "Puan motoru ve hile önleme"). Puan yalnız DOĞRULANMIŞ olaydan
 * yazılır; her yazım idempotenttir (`(userId, action, sourceType, sourceId)` benzersiz). Yazım, olayı üreten işlemin
 * DIŞINDA ve kendi işleminde yapılır: olay akışı puan hatasıyla bozulmaz, kaçırılan puanı günlük uzlaştırma
 * (`reconcileRecentPoints`) ve `points.backfill` tamamlar. Hepsi aynı kuralları kullanır.
 *
 * Eşzamanlılık: alıcı kullanıcı satırı `FOR SHARE` (hesap silme ile sıralanır); aynı mentor–öğrenci ikilisinin görüşme
 * puanları ikili advisory kilidiyle sıralanır (ikili tavanı eşzamanlı iki tamamlanmada da tek puan verir).
 */

type Tx = Prisma.TransactionClient;
export type PointDeps = {
  db: PrismaClient;
  now?: () => Date;
  /** Kurucu üye pilot bitişi. `undefined`: `FOUNDING_MEMBER_UNTIL` env'inden; `null`: pilot açık. */
  foundingUntil?: Date | null;
};
const nowOf = (deps: PointDeps) => (deps.now ?? (() => new Date()))();
const foundingUntilOf = (deps: PointDeps): Date | null =>
  deps.foundingUntil === undefined
    ? (getPointsEnv().FOUNDING_MEMBER_UNTIL ?? null)
    : deps.foundingUntil;

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;
const DAY = 24 * 60 * 60 * 1000;
/** Günlük uzlaştırma penceresi: kaçırılmış olayların bu kadar geriye bakılır. */
export const RECONCILE_DAYS = 14;
const BACKFILL_PAGE = 100;

export type AwardInput = {
  userId: string;
  action: PointAction;
  sourceType: PointSourceType;
  sourceId: string;
  counterpartId?: string | null;
  /** Olayın gerçekleştiği an (görüşmede başlangıç): çarpan takvimi ve gecikme bundan hesaplanır. */
  eventAt: Date;
  /** Sabit yüzde ya da işlem içinde hesaplanan yüzde (görüşme çarpanı). Varsayılan 100. */
  multiplierPercent?: number | ((tx: Tx) => Promise<number>);
};
export type AwardResult = {
  created: boolean;
  entryId: string | null;
  skipped: null | 'RECIPIENT_INELIGIBLE' | 'DUPLICATE' | 'RULE_INACTIVE';
};

/**
 * Tek puan kaydı yazar (SSS gibi sonraki kartların da kancasıdır). Aynı olay ikinci kez gelirse kayıt eklenmez
 * (`DUPLICATE`). Pasif ya da 0 puanlı kural, silinmiş/askıdaki alıcı kayıt üretmez.
 */
export async function awardPoint(tx: Tx, input: AwardInput, now: Date): Promise<AwardResult> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${input.userId} FOR SHARE`;
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: { deletedAt: true, banned: true, banExpires: true },
  });
  if (!user || accountStatusOf(user, now) !== 'ACTIVE')
    return { created: false, entryId: null, skipped: 'RECIPIENT_INELIGIBLE' };
  const key = {
    userId: input.userId,
    action: input.action,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  };
  const existing = await tx.pointEntry.findUnique({
    where: { userId_action_sourceType_sourceId: key },
    select: { id: true },
  });
  if (existing) return { created: false, entryId: existing.id, skipped: 'DUPLICATE' };
  const rule = await tx.pointRule.findUnique({ where: { action: input.action } });
  if (!rule || !rule.isActive || rule.points === 0)
    return { created: false, entryId: null, skipped: 'RULE_INACTIVE' };
  const multiplierPercent =
    typeof input.multiplierPercent === 'function'
      ? await input.multiplierPercent(tx)
      : (input.multiplierPercent ?? 100);
  const { status, finalizesAt } = awardStatus(rule.delayDays, input.eventAt, now);
  const created = await tx.pointEntry.create({
    data: {
      ...key,
      counterpartId: input.counterpartId ?? null,
      basePoints: rule.points,
      multiplierPercent,
      points: pointsOf(rule.points, multiplierPercent),
      status,
      eventAt: input.eventAt,
      finalizesAt,
      finalizedAt: status === 'FINAL' && finalizesAt ? now : null,
    },
    select: { id: true },
  });
  return { created: true, entryId: created.id, skipped: null };
}

/** Puan yazımı olay akışını ASLA bozmaz: hata yutulur (sabit metin), eksik puan uzlaştırmada tamamlanır. */
export async function awardSafely(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch {
    process.stderr.write('points: award failed\n');
  }
}

async function grantFoundingBadge(tx: Tx, userId: string, entryId: string): Promise<void> {
  const existing = await tx.userBadge.findUnique({
    where: { userId_kind: { userId, kind: 'FOUNDING_MEMBER' } },
    select: { id: true },
  });
  // Geri alınmış etiket dahil: bir kez verilen/geri alınan etiket otomatik yeniden verilmez.
  if (existing) return;
  await tx.userBadge.create({ data: { userId, kind: 'FOUNDING_MEMBER', sourceEntryId: entryId } });
}

/** Deneyim yayını (moderasyon onayı) → yazara puan; anonim olmayan ilk pilot deneyimi kurucu üye etiketi (K-10). */
export async function awardForExperience(
  deps: PointDeps,
  experienceId: string,
): Promise<AwardResult | null> {
  const now = nowOf(deps);
  const until = foundingUntilOf(deps);
  return deps.db.$transaction(async (tx) => {
    const row = await tx.experience.findUnique({
      where: { id: experienceId },
      select: { authorId: true, isAnonymous: true, publishedAt: true },
    });
    // Yayın anı yalnız PUBLISHED durumunda dolar (veritabanı CHECK'i); yazarı kopmuş içerik puan üretmez.
    if (!row || !row.authorId || !row.publishedAt) return null;
    const result = await awardPoint(
      tx,
      {
        userId: row.authorId,
        action: 'EXPERIENCE_PUBLISHED',
        sourceType: 'EXPERIENCE',
        sourceId: experienceId,
        eventAt: row.publishedAt,
      },
      now,
    );
    if (
      result.created &&
      result.entryId &&
      isFoundingEligible({ anonymous: row.isAnonymous, publishedAt: row.publishedAt, until })
    ) {
      await grantFoundingBadge(tx, row.authorId, result.entryId);
    }
    return result;
  }, TX_OPTIONS);
}

/** Görüşme (iki taraf onayı, `COMPLETED`) → mentora puan; ikili tavanı ve azalan çarpan uygulanır. */
export async function awardForSession(
  deps: PointDeps,
  appointmentId: string,
): Promise<AwardResult | null> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const row = await tx.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        status: true,
        mode: true,
        mentorId: true,
        menteeId: true,
        startsAt: true,
        feedbacks: { select: { authorId: true, happened: true } },
      },
    });
    if (!row || !bothSidesConfirmed(row.status, row.feedbacks, row.mentorId, row.menteeId))
      return null;
    // Aynı ikilinin eşzamanlı iki tamamlanması sıraya girer: ikinci işlem birincinin kaydını görür.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`points:pair:${row.mentorId}:${row.menteeId}`}, 0))::text`;
    return awardPoint(
      tx,
      {
        userId: row.mentorId,
        action: sessionActionFor(row.mode),
        sourceType: 'APPOINTMENT',
        sourceId: appointmentId,
        counterpartId: row.menteeId,
        eventAt: row.startsAt,
        multiplierPercent: async (inner) => {
          const scored = await inner.pointEntry.findMany({
            where: {
              userId: row.mentorId,
              counterpartId: row.menteeId,
              action: { in: [...SESSION_POINT_ACTIONS] },
              status: { not: 'REVOKED' },
              multiplierPercent: { gt: 0 },
            },
            select: { eventAt: true },
          });
          return sessionMultiplierPercent(
            row.startsAt,
            scored.map((entry) => entry.eventAt),
          );
        },
      },
      now,
    );
  }, TX_OPTIONS);
}

/** CV incelemesi tamamlandı VE öğrenci "faydalı" dedi → mentora tek puan olayı. */
export async function awardForCvReview(
  deps: PointDeps,
  requestId: string,
): Promise<AwardResult | null> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const row = await tx.cvReviewRequest.findUnique({
      where: { id: requestId },
      select: { status: true, mentorId: true, studentId: true, helpfulAt: true },
    });
    if (!row || row.status !== 'COMPLETED' || !row.helpfulAt || row.mentorId === row.studentId)
      return null;
    return awardPoint(
      tx,
      {
        userId: row.mentorId,
        action: 'CV_REVIEW_HELPFUL',
        sourceType: 'CV_REVIEW',
        sourceId: requestId,
        counterpartId: row.studentId,
        eventAt: row.helpfulAt,
      },
      now,
    );
  }, TX_OPTIONS);
}

/**
 * SSS yayını (P1-17; docs/data.md: yayın puanlarla birlikte tek işlemde) → soran 2 (`FAQ_QUESTION_PUBLISHED`), seçilen cevabın mentoru 5 (`FAQ_ANSWER_SELECTED`), seçilmeyen
 * her cevabın yazarı 1 (`FAQ_ANSWER_PARTICIPATION`). Puan YALNIZ yayında yazılır; hepsi idempotenttir (kaynak anahtarı:
 * soran için talep, mentor için cevap kimliği). Karşı taraf kaydedilmez: soran ve cevap verenler birbirini tanımaz.
 * Kullanıcılar sabit sırayla (kimlik) işlenir.
 */
export async function awardFaqInTx(
  tx: Tx,
  requestId: string,
  now: Date,
): Promise<AwardResult | null> {
  const row = await tx.faqRequest.findUnique({
    where: { id: requestId },
    select: {
      askerId: true,
      item: { select: { publishedAt: true } },
      answers: { select: { id: true, mentorId: true, isSelected: true } },
    },
  });
  // Yayın = SSS kaydı vardır (talep durumu ve kayıt aynı işlemde yazılır).
  if (!row || !row.item) return null;
  const eventAt = row.item.publishedAt;
  const awards: AwardInput[] = [];
  if (row.askerId)
    awards.push({
      userId: row.askerId,
      action: 'FAQ_QUESTION_PUBLISHED',
      sourceType: 'FAQ_REQUEST',
      sourceId: requestId,
      eventAt,
    });
  for (const answer of row.answers)
    if (answer.mentorId)
      awards.push({
        userId: answer.mentorId,
        action: answer.isSelected ? 'FAQ_ANSWER_SELECTED' : 'FAQ_ANSWER_PARTICIPATION',
        sourceType: 'FAQ_ANSWER',
        sourceId: answer.id,
        eventAt,
      });
  awards.sort((a, b) => a.userId.localeCompare(b.userId));
  let created = false;
  for (const award of awards) created = (await awardPoint(tx, award, now)).created || created;
  return { created, entryId: null, skipped: null };
}

/** Uzlaştırma ve geri doldurma için bağımsız işlem; yayın anında `awardFaqInTx` yayınla AYNI işlemde çağrılır. */
export async function awardForFaq(deps: PointDeps, requestId: string): Promise<AwardResult | null> {
  const now = nowOf(deps);
  return deps.db.$transaction((tx) => awardFaqInTx(tx, requestId, now), TX_OPTIONS);
}

/**
 * Gecikmesi dolan `PENDING` kayıtları kesinleştirir (`points.finalize`). Karar bekleyen (`OPEN`) şüphe işareti olan
 * kullanıcının bekleyen puanı kesinleşmez: işaret karara bağlanınca bir sonraki çalıştırmada kesinleşir.
 */
export async function finalizeDuePoints(deps: PointDeps): Promise<{ finalized: number }> {
  const now = nowOf(deps);
  const { count } = await deps.db.pointEntry.updateMany({
    where: {
      status: 'PENDING',
      finalizesAt: { lte: now },
      user: { suspicionFlags: { none: { status: 'OPEN' } } },
    },
    data: { status: 'FINAL', finalizedAt: now },
  });
  return { finalized: count };
}

export type BackfillResult = {
  experiences: number;
  sessions: number;
  cvReviews: number;
  faqs: number;
  created: number;
  failed: number;
};

/**
 * Geriye dönük hesaplama (`points.backfill`) ve günlük uzlaştırma: geçmiş yayınları, gerçekleşmiş görüşmeleri ve
 * faydalı CV incelemelerini AYNI kurallarla, olay sırasıyla işler. İdempotenttir: ikinci çalıştırma yeni kayıt
 * eklemez (sonuç değişmez). Bir öğenin hatası diğerlerini durdurmaz (`failed`).
 * `since`: yalnız bu andan sonraki olaylar (uzlaştırma); boşsa hepsi (bir kez çalışan backfill).
 */
export async function runPointBackfill(
  deps: PointDeps,
  options: { since?: Date } = {},
): Promise<BackfillResult> {
  const result: BackfillResult = {
    experiences: 0,
    sessions: 0,
    cvReviews: 0,
    faqs: 0,
    created: 0,
    failed: 0,
  };
  const apply = async (
    kind: 'experiences' | 'sessions' | 'cvReviews' | 'faqs',
    run: () => Promise<AwardResult | null>,
  ) => {
    try {
      const award = await run();
      result[kind] += 1;
      if (award?.created) result.created += 1;
    } catch {
      result.failed += 1;
    }
  };
  const since = options.since;

  for (let cursor: string | undefined; ;) {
    const rows = await deps.db.experience.findMany({
      where: {
        status: 'PUBLISHED',
        authorId: { not: null },
        publishedAt: since ? { gte: since } : { not: null },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      take: BACKFILL_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    for (const row of rows) await apply('experiences', () => awardForExperience(deps, row.id));
    cursor = rows.at(-1)?.id;
    if (rows.length < BACKFILL_PAGE) break;
  }
  for (let cursor: string | undefined; ;) {
    const rows = await deps.db.appointment.findMany({
      where: { status: 'COMPLETED', ...(since ? { startsAt: { gte: since } } : {}) },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: BACKFILL_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    for (const row of rows) await apply('sessions', () => awardForSession(deps, row.id));
    cursor = rows.at(-1)?.id;
    if (rows.length < BACKFILL_PAGE) break;
  }
  for (let cursor: string | undefined; ;) {
    const rows = await deps.db.cvReviewRequest.findMany({
      where: { status: 'COMPLETED', helpfulAt: since ? { gte: since } : { not: null } },
      orderBy: [{ helpfulAt: 'asc' }, { id: 'asc' }],
      take: BACKFILL_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    for (const row of rows) await apply('cvReviews', () => awardForCvReview(deps, row.id));
    cursor = rows.at(-1)?.id;
    if (rows.length < BACKFILL_PAGE) break;
  }
  for (let cursor: string | undefined; ;) {
    const rows = await deps.db.faqRequest.findMany({
      where: { status: 'PUBLISHED', decidedAt: since ? { gte: since } : { not: null } },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
      take: BACKFILL_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    for (const row of rows) await apply('faqs', () => awardForFaq(deps, row.id));
    cursor = rows.at(-1)?.id;
    if (rows.length < BACKFILL_PAGE) break;
  }
  return result;
}

/** Günlük iş (`points.finalize`): bekleyenleri kesinleştirir, son `RECONCILE_DAYS` günde kaçırılan puanı tamamlar. */
export async function runDailyPoints(deps: PointDeps) {
  const now = nowOf(deps);
  const reconcile = await runPointBackfill(deps, {
    since: new Date(now.getTime() - RECONCILE_DAYS * DAY),
  });
  const { finalized } = await finalizeDuePoints(deps);
  return { reconcile, finalized };
}

// ---------------------------------------------------------------------------------------------
// Katılımcı görünümü (yalnız sahibi)
// ---------------------------------------------------------------------------------------------

const entryView = (row: {
  id: string;
  action: PointAction;
  basePoints: number;
  multiplierPercent: number;
  points: number;
  status: 'PENDING' | 'FINAL' | 'REVOKED';
  createdAt: Date;
  finalizesAt: Date | null;
  revokedReason: 'ADMIN_CANCEL' | 'FRAUD_CONFIRMED' | null;
}): PointEntryView => ({
  id: row.id,
  action: row.action,
  basePoints: row.basePoints,
  multiplierPercent: row.multiplierPercent,
  points: row.points,
  status: row.status,
  createdAt: row.createdAt,
  // Yalnız bekleyen kayıtta anlamlı: kesinleşmiş/geri alınmış kayıtta gösterilmez.
  finalizesAt: row.status === 'PENDING' ? row.finalizesAt : null,
  revokedReason: row.revokedReason,
});

export const ENTRY_SELECT = {
  id: true,
  action: true,
  basePoints: true,
  multiplierPercent: true,
  points: true,
  status: true,
  createdAt: true,
  finalizesAt: true,
  revokedReason: true,
} satisfies Prisma.PointEntrySelect;

export async function listEntryViews(
  db: PrismaClient | Tx,
  where: Prisma.PointEntryWhereInput,
  limit: number,
  cursor?: string,
) {
  const rows = await db.pointEntry.findMany({
    where: { ...where, ...idCursorWhere(cursor) },
    orderBy: { id: 'desc' },
    take: limit + 1,
    select: ENTRY_SELECT,
  });
  const page = toPage(rows, limit);
  return { items: page.items.map(entryView), nextCursor: page.nextCursor };
}

/**
 * Katkı puanı özeti ve geçmişi — YALNIZ sahibi (çağıran `requireVerifiedMember` ile kimliği doğrular). Çıktıda kaynak
 * ya da karşı taraf kimliği yoktur. Toplam yalnız `FINAL`; bekleyenler ayrı gösterilir.
 */
export async function getMyContribution(
  deps: PointDeps,
  userId: string,
  input: GetMyContributionInput,
): Promise<ContributionOverview> {
  const parsed = getMyContributionSchema.parse(input);
  const [sums, badges, history] = await Promise.all([
    deps.db.pointEntry.groupBy({
      by: ['status'],
      where: { userId, status: { in: ['PENDING', 'FINAL'] } },
      _sum: { points: true },
    }),
    deps.db.userBadge.findMany({
      where: { userId, revokedAt: null },
      orderBy: { awardedAt: 'asc' },
      select: { kind: true, awardedAt: true },
    }),
    listEntryViews(
      deps.db,
      { userId, ...(parsed.status ? { status: parsed.status } : {}) },
      parsed.limit,
      parsed.cursor,
    ),
  ]);
  const sumOf = (status: 'PENDING' | 'FINAL') =>
    sums.find((row) => row.status === status)?._sum.points ?? 0;
  return {
    summary: { total: sumOf('FINAL'), pending: sumOf('PENDING'), badges },
    history,
  };
}
