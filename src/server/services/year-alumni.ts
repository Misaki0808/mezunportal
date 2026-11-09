import 'server-only';
import { randomBytes } from 'node:crypto';
import messages from '../../../messages/tr.json';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  awardCycleInputSchema,
  configureAwardCycleSchema,
  recalculateAwardCycleSchema,
  selectYearAlumnusSchema,
  setAwardPublicationSchema,
  awardCandidateSchema,
  type AwardCycleView,
  type MyAward,
} from '@/contracts/year-alumni';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { academicYearBounds, awardFreezeAt, linkedinAwardUrl } from '../rules/yearAlumni';
import { createPermissions } from '../permissions/guards';
import { requireConsent } from './privacy';
import { covers, loadAnyAdmin, TX_OPTIONS } from './admin-access';
import { recordAdminAction } from './audit';

type Tx = Prisma.TransactionClient;
type Deps = { db: PrismaClient; now?: () => Date };
const nowOf = (deps: Deps) => deps.now?.() ?? new Date();
export const AWARD_PUBLICATION_CONSENT_VERSION = 'taslak-1';
const freezeDeadline = (ceremonyAt: Date) => ceremonyAt.getTime() - 30 * 86400_000;
const FREEZE_GRACE_MS = 2 * 60_000;
const day = (date: Date) => new Date(date.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
async function admin(tx: Tx, userId: string, departmentId: string, now: Date) {
  const actor = await loadAnyAdmin(tx, userId, now);
  if (!(await covers(tx, actor, departmentId))) throw codedForbidden('AUTH_FORBIDDEN');
  return actor;
}
async function alumni(tx: Tx, userId: string, now: Date) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
  await createPermissions({
    db: () => tx,
    getSessionUserId: async () => userId,
    now: () => now,
  }).requireVerifiedMember({ roles: ['ALUMNI'] });
  await requireConsent(tx, userId);
}
async function candidateRows(tx: Tx, departmentId: string, year: number, now: Date) {
  const { start, end } = academicYearBounds(year);
  const members = await tx.membership.findMany({
    where: {
      departmentId,
      role: 'ALUMNI',
      endedAt: null,
      verificationStatus: 'VERIFIED',
      user: { deletedAt: null, OR: [{ banned: false }, { banExpires: { lte: now } }] },
    },
    select: {
      userId: true,
      user: {
        select: { name: true, suspicionFlags: { where: { status: 'OPEN' }, select: { id: true } } },
      },
    },
  });
  const excludedForSuspicion = members.filter((m) => m.user.suspicionFlags.length).length;
  const eligible = members.filter((m) => !m.user.suspicionFlags.length);
  const ids = eligible.map((m) => m.userId);
  const [entries, flags, experiences, meetings] = await Promise.all([
    tx.pointEntry.findMany({
      where: { userId: { in: ids }, status: 'FINAL', eventAt: { gte: start, lt: end } },
      select: { id: true, userId: true, action: true, points: true },
    }),
    tx.suspicionFlag.findMany({
      where: { userId: { in: ids }, status: { in: ['OPEN', 'CONFIRMED'] } },
      select: { entryIds: true },
    }),
    tx.experience.groupBy({
      by: ['authorId'],
      where: {
        authorId: { in: ids },
        departmentIdAtWrite: departmentId,
        status: 'PUBLISHED',
        publishedAt: { gte: start, lt: end },
      },
      _count: true,
    }),
    tx.appointment.groupBy({
      by: ['mentorId'],
      where: { mentorId: { in: ids }, status: 'COMPLETED', startsAt: { gte: start, lt: end } },
      _count: true,
    }),
  ]);
  const excludedEntries = new Set(flags.flatMap((flag) => flag.entryIds));
  const rows = eligible.map(({ userId, user }) => {
    const breakdown = new Map<string, number>();
    for (const entry of entries)
      if (entry.userId === userId && !excludedEntries.has(entry.id))
        breakdown.set(entry.action, (breakdown.get(entry.action) ?? 0) + entry.points);
    const row = {
      userId,
      name: user.name,
      points: [...breakdown.values()].reduce((a, b) => a + b, 0),
      experienceCount: experiences.find((x) => x.authorId === userId)?._count ?? 0,
      meetingCount: meetings.find((x) => x.mentorId === userId)?._count ?? 0,
      breakdown: [...breakdown].map(([action, points]) => ({ action, points })),
    };
    return awardCandidateSchema.parse(row);
  });
  rows.sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  return { rows, excludedForSuspicion };
}
async function lockCycle(tx: Tx, departmentId: string, year: number) {
  await tx.$queryRaw`SELECT "id" FROM "AwardCycle" WHERE "departmentId"=${departmentId} AND "year"=${year} FOR UPDATE`;
  const cycle = await tx.awardCycle.findUnique({
    where: { departmentId_year: { departmentId, year } },
  });
  if (!cycle) throw codedNotFound('RESOURCE_NOT_FOUND');
  return cycle;
}
async function freeze(
  tx: Tx,
  cycle: { id: string; departmentId: string; year: number },
  now: Date,
) {
  // Hesap silme ile aynı kullanıcı satırlarında sıralanır; silinen kullanıcının anlık görüntüsü geri gelmez.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (SELECT "userId" FROM "Membership" WHERE "departmentId"=${cycle.departmentId} AND "role"='ALUMNI') ORDER BY "id" FOR UPDATE`;
  const { rows } = await candidateRows(tx, cycle.departmentId, cycle.year, now);
  await tx.awardCandidate.deleteMany({ where: { cycleId: cycle.id } });
  if (rows.length)
    await tx.awardCandidate.createMany({
      data: rows.map((r) => ({
        cycleId: cycle.id,
        userId: r.userId,
        points: r.points,
        experienceCount: r.experienceCount,
        meetingCount: r.meetingCount,
        breakdown: r.breakdown,
      })),
    });
  await tx.awardCycle.update({ where: { id: cycle.id }, data: { frozenAt: now } });
}
async function view(
  tx: Tx,
  cycle: {
    id: string;
    departmentId: string;
    year: number;
    ceremonyAt: Date;
    frozenAt: Date | null;
  },
  now: Date,
  actor: { userId: string },
): Promise<AwardCycleView> {
  let candidates;
  let excludedForSuspicion = 0;
  if (cycle.frozenAt) {
    const disqualifyingFlags: Prisma.SuspicionFlagWhereInput = {
      OR: [{ status: 'OPEN' }, { status: 'CONFIRMED', decidedAt: { gt: cycle.frozenAt } }],
    };
    const rows = await tx.awardCandidate.findMany({
      where: {
        cycleId: cycle.id,
        user: {
          deletedAt: null,
          OR: [{ banned: false }, { banExpires: { lte: now } }],
          suspicionFlags: { none: disqualifyingFlags },
          memberships: {
            some: {
              departmentId: cycle.departmentId,
              role: 'ALUMNI',
              verificationStatus: 'VERIFIED',
              endedAt: null,
            },
          },
        },
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ points: 'desc' }, { userId: 'asc' }],
    });
    candidates = rows.map((r) =>
      awardCandidateSchema.parse({
        userId: r.userId,
        name: r.user.name,
        points: r.points,
        experienceCount: r.experienceCount,
        meetingCount: r.meetingCount,
        breakdown: r.breakdown,
      }),
    );
    excludedForSuspicion = await tx.awardCandidate.count({
      where: { cycleId: cycle.id, user: { suspicionFlags: { some: disqualifyingFlags } } },
    });
  } else {
    const calculated = await candidateRows(tx, cycle.departmentId, cycle.year, now);
    candidates = calculated.rows;
    excludedForSuspicion = calculated.excludedForSuspicion;
  }
  const selected = await tx.award.findFirst({
    where: { cycleId: cycle.id },
    select: { id: true, userId: true, createdAt: true },
  });
  const awardFlags = selected
    ? await tx.suspicionFlag.findMany({
        where: {
          userId: selected.userId,
          status: 'CONFIRMED',
          decidedAt: { gt: selected.createdAt },
        },
        select: { id: true },
      })
    : [];
  // Döngü kilidi altında, yöneticiye ilk gösterimde her ödül/bayrak için tek uyarı kaydı.
  for (const flag of awardFlags) {
    const recorded = await tx.adminAuditLog.findFirst({
      where: {
        action: 'AWARD_REVIEW_REQUIRED',
        targetId: selected!.id,
        metadata: { path: ['flagId'], equals: flag.id },
      },
      select: { id: true },
    });
    if (!recorded)
      await recordAdminAction(tx, {
        actor,
        action: 'AWARD_REVIEW_REQUIRED',
        targetType: 'AWARD',
        targetId: selected!.id,
        metadata: { flagId: flag.id },
      });
  }
  return {
    year: cycle.year,
    departmentId: cycle.departmentId,
    ceremonyDate: day(cycle.ceremonyAt),
    frozenAt: cycle.frozenAt,
    candidates,
    excludedForSuspicion,
    selectedUserId: selected?.userId ?? null,
    selectedNeedsReview: awardFlags.length > 0,
  };
}
export async function configureAwardCycle(deps: Deps, userId: string, input: unknown) {
  const data = configureAwardCycleSchema.parse(input),
    now = nowOf(deps);
  const ceremonyAt = new Date(`${data.ceremonyDate}T00:00:00+03:00`);
  if (awardFreezeAt(data.ceremonyDate) <= now) throw codedValidation('VALIDATION_INVALID');
  return deps.db.$transaction(async (tx) => {
    const actor = await admin(tx, userId, data.departmentId, now);
    const old = await tx.awardCycle.findUnique({
      where: { departmentId_year: { departmentId: data.departmentId, year: data.year } },
    });
    if (old) {
      const locked = await lockCycle(tx, data.departmentId, data.year);
      if (locked.frozenAt || now >= new Date(locked.ceremonyAt.getTime() - 30 * 86400_000))
        throw codedValidation('VALIDATION_INVALID');
    }
    const cycle = await tx.awardCycle.upsert({
      where: { departmentId_year: { departmentId: data.departmentId, year: data.year } },
      create: { departmentId: data.departmentId, year: data.year, ceremonyAt },
      update: { ceremonyAt },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'AWARD_CYCLE_CONFIGURE',
      targetType: 'AWARD_CYCLE',
      targetId: cycle.id,
    });
    return view(tx, cycle, now, actor);
  }, TX_OPTIONS);
}
export async function listAwardCandidates(deps: Deps, userId: string, input: unknown) {
  const data = awardCycleInputSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await admin(tx, userId, data.departmentId, now);
    let cycle = await lockCycle(tx, data.departmentId, data.year);
    if (!cycle.frozenAt && now >= new Date(cycle.ceremonyAt.getTime() - 30 * 86400_000)) {
      if (now.getTime() > freezeDeadline(cycle.ceremonyAt) + FREEZE_GRACE_MS)
        throw codedConflict('AWARD_FREEZE_MISSED');
      await freeze(tx, cycle, now);
      cycle = (await tx.awardCycle.findUnique({ where: { id: cycle.id } }))!;
    }
    return view(tx, cycle, now, actor);
  }, TX_OPTIONS);
}
export async function recalculateAwardCycle(deps: Deps, userId: string, input: unknown) {
  const data = recalculateAwardCycleSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await admin(tx, userId, data.departmentId, now);
    const cycle = await lockCycle(tx, data.departmentId, data.year);
    if (!cycle.frozenAt && now.getTime() <= freezeDeadline(cycle.ceremonyAt) + FREEZE_GRACE_MS)
      throw codedValidation('VALIDATION_INVALID');
    await freeze(tx, cycle, now);
    await recordAdminAction(tx, {
      actor,
      action: 'AWARD_RECALCULATE',
      targetType: 'AWARD_CYCLE',
      targetId: cycle.id,
      reason: data.reason,
    });
    return view(tx, { ...cycle, frozenAt: now }, now, actor);
  }, TX_OPTIONS);
}
export async function selectYearAlumnus(deps: Deps, userId: string, input: unknown) {
  const data = selectYearAlumnusSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await admin(tx, userId, data.departmentId, now);
    const cycle = await lockCycle(tx, data.departmentId, data.year);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${data.userId} FOR UPDATE`;
    if (!cycle.frozenAt) throw codedValidation('VALIDATION_INVALID');
    const available = await view(tx, cycle, now, actor);
    if (!available.candidates.some((x) => x.userId === data.userId) || available.selectedUserId)
      throw codedValidation('VALIDATION_INVALID');
    const award = await tx.award.create({
      data: {
        cycleId: cycle.id,
        departmentId: data.departmentId,
        year: data.year,
        userId: data.userId,
        verificationCode: randomBytes(32).toString('base64url'),
        createdAt: now,
      },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'AWARD_SELECT',
      targetType: 'AWARD',
      targetId: award.id,
      reason: data.reason,
    });
    return { awardId: award.id };
  }, TX_OPTIONS);
}
async function awardView(tx: Tx, id: string, userId: string): Promise<MyAward> {
  const a = await tx.award.findFirst({
    where: { id, userId },
    omit: { verificationCode: false },
    include: { department: { include: { faculty: { include: { university: true } } } } },
  });
  if (!a) throw codedNotFound('RESOURCE_NOT_FOUND');
  const university = a.department.faculty.university;
  const issuedAt = new Date(a.createdAt.getTime() + 3 * 3600_000);
  const isPublic =
    !!a.publicConsentAt && a.publicConsentVersion === AWARD_PUBLICATION_CONSENT_VERSION;
  const verificationUrl = isPublic
    ? new URL(`/dogrula/${a.verificationCode}`, getEnv().APP_URL).toString()
    : null;
  return {
    id: a.id,
    department: a.department.name,
    university: university.name,
    year: a.year,
    createdAt: a.createdAt,
    isPublic,
    verificationUrl,
    linkedinUrl: verificationUrl
      ? linkedinAwardUrl({
          name: messages.yearAlumni.awardName,
          organization: university.name,
          organizationId: university.linkedinOrganizationId,
          year: issuedAt.getUTCFullYear(),
          month: issuedAt.getUTCMonth() + 1,
          verificationUrl,
        })
      : null,
  };
}
export async function listMyAwards(deps: Deps, userId: string): Promise<MyAward[]> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await alumni(tx, userId, now);
    const awards = await tx.award.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(awards.map((a) => awardView(tx, a.id, userId)));
  }, TX_OPTIONS);
}
export async function setAwardPublication(deps: Deps, userId: string, input: unknown) {
  const data = setAwardPublicationSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await alumni(tx, userId, now);
    const changed = await tx.award.updateMany({
      where: { id: data.awardId, userId },
      data: {
        publicConsentAt: data.public ? now : null,
        publicConsentVersion: data.public ? AWARD_PUBLICATION_CONSENT_VERSION : null,
      },
    });
    if (!changed.count) throw codedNotFound('RESOURCE_NOT_FOUND');
    await tx.awardPublicationDecision.create({
      data: {
        awardId: data.awardId,
        userId,
        version: AWARD_PUBLICATION_CONSENT_VERSION,
        granted: data.public,
        createdAt: now,
      },
    });
    return awardView(tx, data.awardId, userId);
  }, TX_OPTIONS);
}
/** Çağrıldığı anda açık rıza ve canlı hesap sorgulanır; rızasız ve olmayan için aynı null. */
export async function publicAward(db: PrismaClient, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const a = await db.award.findFirst({
    where: {
      verificationCode: code,
      publicConsentAt: { not: null },
      publicConsentVersion: AWARD_PUBLICATION_CONSENT_VERSION,
      user: { deletedAt: null },
    },
    select: {
      year: true,
      user: { select: { name: true } },
      department: {
        select: { name: true, faculty: { select: { university: { select: { name: true } } } } },
      },
    },
  });
  return a
    ? {
        name: a.user.name,
        award: messages.yearAlumni.awardName,
        department: a.department.name,
        year: a.year,
        university: a.department.faculty.university.name,
      }
    : null;
}
/** Zamanlanmış iş, her döngüyü kilit altında bir kez dondurur. */
export async function freezeDueAwardCycles(db: PrismaClient, now = new Date()) {
  const due = await db.awardCycle.findMany({
    where: { frozenAt: null, ceremonyAt: { lte: new Date(now.getTime() + 30 * 86400_000) } },
    select: { departmentId: true, year: true },
  });
  for (const item of due)
    await db.$transaction(async (tx) => {
      const cycle = await lockCycle(tx, item.departmentId, item.year);
      if (!cycle.frozenAt && now.getTime() <= freezeDeadline(cycle.ceremonyAt) + FREEZE_GRACE_MS)
        await freeze(tx, cycle, now);
    }, TX_OPTIONS);
}
