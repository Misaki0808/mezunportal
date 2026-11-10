import 'server-only';

import { createHash } from 'node:crypto';

import {
  SUSPICION_RECENT_EVIDENCE_LIMIT,
  SUSPICION_SEEN_KEYS_LIMIT,
  storedRecurrenceEvidenceSchema,
  type SuspicionRule,
} from '@/contracts/points';

import {
  detectBurst,
  detectSingleCounterpart,
  detectSyncFeedback,
  detectReferralPatterns,
  SUSPICION_THRESHOLDS,
  type ScanEntry,
  type SuspicionFinding,
  type SyncSession,
} from '../rules/pointsSuspicion';
import type { PointDeps } from './points';

/**
 * Günlük şüphe taraması (`points.suspicionScan`; K-11). İşaret CEZA DEĞİLDİR: puanı geri almaz, yalnız sistem yöneticisine
 * karar için görünür ve kullanıcının BEKLEYEN puanını karara kadar kesinleştirmez. Aynı kanıt iki kez işaretlenmez
 * (`evidenceKey` benzersiz); aynı (kullanıcı, kural) için karar bekleyen en çok bir işaret vardır (kısmi benzersiz indeks).
 * Tarama tekrar çalıştırılabilir: ikinci çalıştırma yeni işaret üretmez.
 */

const DAY = 24 * 60 * 60 * 1000;
const USER_PAGE = 200;

export function evidenceKeyOf(rule: SuspicionRule, entryIds: readonly string[]): string {
  return createHash('sha256')
    .update(`${rule}:${[...entryIds].sort().join(',')}`)
    .digest('hex')
    .slice(0, 32);
}

export async function runSuspicionScan(
  deps: PointDeps,
): Promise<{ scanned: number; flagged: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const horizon = Math.max(
    SUSPICION_THRESHOLDS.syncWindowDays,
    SUSPICION_THRESHOLDS.counterpartWindowDays,
  );
  const since = new Date(now.getTime() - horizon * DAY);
  const live = {
    status: { not: 'REVOKED' as const },
    points: { gt: 0 },
    // Üst sınırı dedektörler uygular (`<= now`).
    eventAt: { gte: since },
  };
  const { scanCampusEventPatterns } = await import('./campus-event');
  let scanned = 0;
  let flagged = await scanCampusEventPatterns(deps.db, now);
  for (let after: string | undefined; ;) {
    const users = await deps.db.pointEntry.findMany({
      where: {
        status: live.status,
        eventAt: live.eventAt,
        OR: [{ points: { gt: 0 } }, { action: 'REFERRAL_GIVEN' }],
        ...(after ? { userId: { gt: after } } : {}),
      },
      distinct: ['userId'],
      orderBy: { userId: 'asc' },
      take: USER_PAGE,
      select: { userId: true },
    });
    for (const { userId } of users) {
      scanned += 1;
      flagged += await scanUser(deps, userId, live, now);
    }
    after = users.at(-1)?.userId;
    if (users.length < USER_PAGE) break;
  }
  return { scanned, flagged };
}

async function scanUser(
  deps: PointDeps,
  userId: string,
  live: { status: { not: 'REVOKED' }; points: { gt: number }; eventAt: { gte: Date } },
  now: Date,
): Promise<number> {
  const rows = await deps.db.pointEntry.findMany({
    where: { userId, ...live },
    orderBy: [{ eventAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      points: true,
      eventAt: true,
      counterpartId: true,
      sourceType: true,
      sourceId: true,
    },
  });
  const entries: ScanEntry[] = rows.map(({ id, points, eventAt, counterpartId }) => ({
    id,
    points,
    eventAt,
    counterpartId,
  }));
  const referralEntries = await deps.db.pointEntry.findMany({
    where: { userId, status: live.status, eventAt: live.eventAt, action: 'REFERRAL_GIVEN' },
    select: { id: true, points: true, eventAt: true, counterpartId: true },
  });
  const findings: SuspicionFinding[] = detectReferralPatterns(referralEntries, now);
  const burst = detectBurst(entries);
  if (burst) findings.push(burst);
  const single = detectSingleCounterpart(entries, now);
  if (single) findings.push(single);

  const sessions = rows.filter((row) => row.sourceType === 'APPOINTMENT' && row.counterpartId);
  if (sessions.length > 0) {
    const feedbacks = await deps.db.sessionFeedback.findMany({
      where: { appointmentId: { in: sessions.map((row) => row.sourceId) } },
      select: { appointmentId: true, authorId: true, createdAt: true },
    });
    const synced: SyncSession[] = [];
    for (const row of sessions) {
      const mine = feedbacks.find((f) => f.appointmentId === row.sourceId && f.authorId === userId);
      const theirs = feedbacks.find(
        (f) => f.appointmentId === row.sourceId && f.authorId === row.counterpartId,
      );
      if (mine && theirs && row.counterpartId) {
        synced.push({
          entryId: row.id,
          counterpartId: row.counterpartId,
          eventAt: row.eventAt,
          mentorFeedbackAt: mine.createdAt,
          menteeFeedbackAt: theirs.createdAt,
        });
      }
    }
    const pointsById = new Map(rows.map((row) => [row.id, row.points]));
    const sync = detectSyncFeedback(synced, now, (id) => pointsById.get(id) ?? 0);
    if (sync) findings.push(sync);
  }

  let created = 0;
  for (const finding of findings) {
    const evidenceKey = evidenceKeyOf(finding.rule, finding.entryIds);
    const { count } = await deps.db.suspicionFlag.createMany({
      data: [
        {
          userId,
          rule: finding.rule,
          evidenceKey,
          entryIds: finding.entryIds,
          windowStart: finding.windowStart,
          windowEnd: finding.windowEnd,
          entryCount: finding.entryIds.length,
          points: finding.points,
          sharePercent: finding.sharePercent,
          syncedCount: finding.syncedCount,
        },
      ],
      skipDuplicates: true,
    });
    created += count;
    // Eklenmediyse: aynı kanıt zaten işaretli ya da aynı kural için KARAR BEKLEYEN işaret var. İkincisinde yeni kanıt
    // sessizce atlanmaz; açık işarete sayaç + son görülme olarak işlenir (yeni işaret açılmaz).
    if (count === 0) await recordRecurrence(deps, userId, finding, evidenceKey, now);
  }
  return created;
}

/**
 * Açık işarete yeni kanıt ekler (idempotent): işlem içinde işaret kilitlenir; `seenEvidenceKeys` içindeki ya da işaretin
 * kendi kanıtı olan anahtar tekrar sayılmaz, böylece aynı tarama iki kez sayacı bir kez artırır. Kanıt kimlikleri
 * (`entryIds`) değişmez: karar yalnız işaretin asıl kanıtını geri alır; sonraki tarama kalanı yeniden işaretler.
 */
async function recordRecurrence(
  deps: PointDeps,
  userId: string,
  finding: SuspicionFinding,
  evidenceKey: string,
  now: Date,
): Promise<void> {
  await deps.db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "SuspicionFlag"
      WHERE "userId"=${userId} AND "rule"=${finding.rule}::"SuspicionRule" AND "status"='OPEN'
      FOR UPDATE`;
    const open = rows[0];
    if (!open) return; // aynı kanıt kararlı bir işarette: yeni bir şey yok
    const flag = await tx.suspicionFlag.findUniqueOrThrow({
      where: { id: open.id },
      select: { evidenceKey: true, seenEvidenceKeys: true, recentEvidence: true },
    });
    if (flag.evidenceKey === evidenceKey || flag.seenEvidenceKeys.includes(evidenceKey)) return;
    const recent = storedRecurrenceEvidenceSchema.catch([]).parse(flag.recentEvidence);
    await tx.suspicionFlag.update({
      where: { id: open.id },
      data: {
        recurrenceCount: { increment: 1 },
        lastSeenAt: now,
        seenEvidenceKeys: [...flag.seenEvidenceKeys, evidenceKey].slice(-SUSPICION_SEEN_KEYS_LIMIT),
        recentEvidence: [
          { at: now.toISOString(), entryCount: finding.entryIds.length, points: finding.points },
          ...recent,
        ].slice(0, SUSPICION_RECENT_EVIDENCE_LIMIT),
      },
    });
  });
}
